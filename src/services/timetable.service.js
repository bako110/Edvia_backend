import { Classe, Creneau, User } from '../models/index.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'
import { findClasse, requireAccess } from './classe.service.js'

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const toMinutes = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

async function names(school) {
  return new Map((await User.find({ school }).select('name')).map(u => [u.id, u.name]))
}
const dto = (c, classe, who) => {
  const m = classe.matieres.id(c.matiere)
  return {
    id: String(c._id), classeId: classe.id, classe: classe.name, day: c.day, start: hhmm(c.start), end: hhmm(c.end), room: c.room,
    matiereId: String(c.matiere), matiere: m?.name || '(matière supprimée)',
    teacherId: m?.teacher ? String(m.teacher) : null, teacher: m?.teacher ? who.get(String(m.teacher)) || null : null,
  }
}

// Emploi du temps d'une classe (toute personne ayant accès à la classe)
export async function forClasse(user, classeId) {
  const classe = await findClasse(user, classeId)
  requireAccess(user, classe)
  const [list, who] = await Promise.all([Creneau.find({ classe: classe._id }).sort('day start').lean(), names(user.school)])
  return { classe: { id: classe.id, name: classe.name }, creneaux: list.map(c => dto(c, classe, who)) }
}

// Emploi du temps personnel d'un enseignant : ses cours dans toutes ses classes
export async function mine(user) {
  const classes = await Classe.find({ school: user.school, annee: user.annee, 'matieres.teacher': user._id })
  const who = await names(user.school)
  const out = []
  for (const classe of classes) {
    const mine = new Set(classe.matieres.filter(m => String(m.teacher) === user.id).map(m => m.id))
    const list = await Creneau.find({ classe: classe._id, matiere: { $in: [...mine] } }).lean()
    out.push(...list.map(c => dto(c, classe, who)))
  }
  return { creneaux: out.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)) }
}

// Refuse un cours qui chevauche un autre cours de la même classe ou du même enseignant
async function checkConflicts(user, classe, matiere, { day, start, end }, selfId) {
  const clash = { day, start: { $lt: end }, end: { $gt: start }, ...(selfId ? { _id: { $ne: selfId } } : {}) }
  const sameClass = await Creneau.findOne({ ...clash, classe: classe._id })
  if (sameClass) {
    const m = classe.matieres.id(sameClass.matiere)
    throw conflict(`La ${classe.name} a déjà un cours à ce moment (${m?.name || 'autre matière'}, ${hhmm(sameClass.start)}–${hhmm(sameClass.end)})`)
  }
  if (matiere.teacher) {
    const classes = await Classe.find({ school: user.school, annee: user.annee, 'matieres.teacher': matiere.teacher })
    const ids = classes.flatMap(c => c.matieres.filter(m => String(m.teacher) === String(matiere.teacher)).map(m => m._id))
    const busy = await Creneau.findOne({ ...clash, matiere: { $in: ids } })
    if (busy) {
      const other = classes.find(c => String(c._id) === String(busy.classe))
      const t = await User.findById(matiere.teacher).select('name')
      throw conflict(`${t?.name || 'L’enseignant'} enseigne déjà en ${other?.name || 'une autre classe'} à ce moment (${hhmm(busy.start)}–${hhmm(busy.end)})`)
    }
  }
}

function parse(data) {
  const start = toMinutes(data.start), end = toMinutes(data.end)
  if (end <= start) throw badRequest('L’heure de fin doit être après l’heure de début')
  return { day: data.day, start, end }
}

export async function create(user, classeId, data) {
  const classe = await findClasse(user, classeId)
  const matiere = classe.matieres.id(data.matiereId)
  if (!matiere) throw notFound('Matière introuvable pour cette classe')
  const t = parse(data)
  await checkConflicts(user, classe, matiere, t)
  const c = await Creneau.create({ school: user.school, classe: classe._id, matiere: matiere._id, ...t, room: data.room || '' })
  return dto(c, classe, await names(user.school))
}

export async function update(user, id, data) {
  const c = await Creneau.findOne({ _id: id, school: user.school })
  if (!c) throw notFound('Cours introuvable')
  const classe = await findClasse(user, c.classe)
  const matiere = classe.matieres.id(data.matiereId ?? c.matiere)
  if (!matiere) throw notFound('Matière introuvable pour cette classe')
  const t = parse({ day: data.day ?? c.day, start: data.start ?? hhmm(c.start), end: data.end ?? hhmm(c.end) })
  await checkConflicts(user, classe, matiere, t, c._id)
  Object.assign(c, t, { matiere: matiere._id })
  if (data.room !== undefined) c.room = data.room
  await c.save()
  return dto(c, classe, await names(user.school))
}

export async function remove(user, id) {
  const c = await Creneau.findOne({ _id: id, school: user.school })
  if (!c) throw notFound('Cours introuvable')
  await c.deleteOne()
}

// Programme complet de l'établissement (administration) : tous les cours de toutes les classes de l'année
export async function all(user) {
  const [classes, who] = await Promise.all([Classe.find({ school: user.school, annee: user.annee }).sort('name'), names(user.school)])
  const byId = new Map(classes.map(c => [String(c._id), c]))
  const list = await Creneau.find({ classe: { $in: classes.map(c => c._id) } }).lean()
  const creneaux = list.map(c => dto(c, byId.get(String(c.classe)), who))
    .sort((a, b) => a.classe.localeCompare(b.classe, 'fr', { numeric: true }) || a.day - b.day || a.start.localeCompare(b.start))
  return { creneaux }
}
