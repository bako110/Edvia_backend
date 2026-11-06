import { extraDto } from '../utils/student.js'
import { Classe, Eleve, User, Incident, FeePlan, Paiement, Creneau, Devoir } from '../models/index.js'
import { isOffice } from '../policies/access.js'
import { audit } from './audit.service.js'
import { sealCode } from '../utils/seal.js'
import { TRIM } from '../utils/locks.js'
import { forClasse } from './incident.service.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js'
import { classAccess } from '../policies/access.js'

export const DEFAULT_MATIERES = [['Mathématiques', 4], ['Français', 4], ['SVT', 2], ['Histoire-Géo', 2], ['Anglais', 2], ['Physique-Chimie', 2]]

/* ---------- accès ---------- */
export async function findClasse(user, id) {
  const c = await Classe.findOne({ _id: id, school: user.school, annee: user.annee })
  if (!c) throw notFound('Classe introuvable')
  return c
}
export function requireAccess(user, classe) {
  const access = classAccess(user, classe)
  if (!access) throw forbidden('Vous n’avez pas accès à cette classe')
  return access
}
async function checkTeacher(user, id) {
  if (!id) return null
  if (!(await User.exists({ _id: id, school: user.school, role: 'teacher', active: true }))) throw badRequest('Enseignant introuvable ou inactif')
  return id
}
function findMatiere(classe, mid) {
  const m = classe.matieres.id(mid)
  if (!m) throw notFound('Matière introuvable')
  return m
}

/* ---------- classes ---------- */
export async function list(user) {
  const [classes, counts, users] = await Promise.all([
    Classe.find({ school: user.school, annee: user.annee }).sort('name'),
    Eleve.aggregate([{ $match: { school: user.school } }, { $group: { _id: '$classe', n: { $sum: 1 } } }]),
    User.find({ school: user.school }).select('name'),
  ])
  const nb = new Map(counts.map(x => [String(x._id), x.n])), names = new Map(users.map(u => [u.id, u.name]))
  return classes
    .map(c => ({
      id: c.id, name: c.name,
      principal: c.principal ? { id: String(c.principal), name: names.get(String(c.principal)) || null } : null,
      nbEleves: nb.get(c.id) || 0, nbMatieres: c.matieres.length, access: classAccess(user, c),
    }))
    .filter(c => c.access)
}

export async function create(user, { name, defaults }) {
  const matieres = defaults === false ? [] : DEFAULT_MATIERES.map(([n, coef]) => ({ name: n, coef }))
  const c = await Classe.create({ school: user.school, annee: user.annee, name, matieres })
  return { id: c.id }
}

export async function update(user, id, data) {
  const c = await findClasse(user, id)
  if (data.name !== undefined) c.name = data.name
  if (data.principal !== undefined) c.principal = await checkTeacher(user, data.principal)
  await c.save()
}

export async function remove(user, id) {
  const c = await findClasse(user, id)
  await Eleve.deleteMany({ classe: c._id })
  await Promise.all([Incident, FeePlan, Paiement, Creneau, Devoir].map(M => M.deleteMany({ classe: c._id })))
  await c.deleteOne()
}

// Verrouille / déverrouille un trimestre (fin du conseil de classe) : plus aucune note ni pénalité n'est modifiable tant qu'il est verrouillé
export async function setLock(user, id, { tr, locked }) {
  // le personnel peut verrouiller (clore un trimestre) mais seul l'administrateur peut rouvrir des notes
  if (!locked && user.role !== 'admin') throw forbidden('Seul l’administrateur peut déverrouiller un trimestre')
  const c = await findClasse(user, id)
  const was = !!c.locked?.[tr]
  c.locked = [0, 1, 2].map(i => (i === tr ? locked : !!c.locked?.[i]))
  await audit(user, locked ? 'verrou' : 'deverrou', { classe: c._id, detail: { trimestre: TRIM[tr], etait: was } })
  await c.save()
  return { locked: c.locked }
}

/* ---------- matières ---------- */
export async function addMatiere(user, id, { name, coef, teacher }) {
  const c = await findClasse(user, id)
  if (c.matieres.some(m => m.name === name)) throw conflict('Cette matière existe déjà dans la classe')
  c.matieres.push({ name, coef, teacher: await checkTeacher(user, teacher) })
  await c.save()
  return { id: c.matieres[c.matieres.length - 1].id }
}

export async function updateMatiere(user, id, mid, data) {
  const c = await findClasse(user, id), m = findMatiere(c, mid)
  if (data.name !== undefined && data.name !== m.name) {
    if (c.matieres.some(x => x.name === data.name)) throw conflict('Cette matière existe déjà dans la classe')
    m.name = data.name
  }
  if (data.coef !== undefined) m.coef = data.coef
  if (data.teacher !== undefined) m.teacher = await checkTeacher(user, data.teacher)
  await c.save()
}

export async function removeMatiere(user, id, mid) {
  const c = await findClasse(user, id), m = findMatiere(c, mid)
  if (c.matieres.length < 2) throw badRequest('Une classe doit garder au moins une matière')
  const key = m.id
  m.deleteOne()
  await c.save()
  await Creneau.deleteMany({ classe: c._id, matiere: key })
  await Devoir.deleteMany({ classe: c._id, matiere: key })
  // on efface aussi les notes de cette matière
  await Eleve.updateMany({ classe: c._id }, { $unset: { [`notes.0.${key}`]: '', [`notes.1.${key}`]: '', [`notes.2.${key}`]: '' } })
}

/*
 * Données complètes d'une classe : matières, élèves, notes, observations.
 * Un enseignant simple ne reçoit QUE ses matières (et leurs notes) ; administration et
 * professeur principal reçoivent tout.
 */
export async function full(user, id) {
  const classe = await findClasse(user, id), access = requireAccess(user, classe)
  const [users, eleves, incidents] = await Promise.all([
    User.find({ school: user.school }).select('name'),
    Eleve.find({ classe: classe._id }).collation({ locale: 'fr' }).sort('name').lean(),
    forClasse(user, classe, access),
  ])
  const names = new Map(users.map(u => [u.id, u.name]))
  const matieres = classe.matieres.filter(m => access === 'full' || String(m.teacher) === user.id)
  const keep = new Set(matieres.map(m => m.id))

  return {
    classe: {
      id: classe.id, name: classe.name, access,
      locked: [0, 1, 2].map(i => !!classe.locked?.[i]),
      principalId: classe.principal ? String(classe.principal) : null, principalName: names.get(String(classe.principal)) || null,
    },
    matieres: matieres.map(m => ({
      id: m.id, name: m.name, coef: m.coef,
      teacherId: m.teacher ? String(m.teacher) : null, teacherName: names.get(String(m.teacher)) || null,
    })),
    eleves: eleves.map(e => {
      const notes = {}
      for (const [tr, byMatiere] of Object.entries(e.notes || {})) {
        for (const [mid, n] of Object.entries(byMatiere)) {
          if (keep.has(mid)) (notes[tr] ||= {})[mid] = [n.d1 || '', n.d2 || '', n.c || '']
        }
      }
      const dto = { id: String(e._id), name: e.name, matricule: e.matricule || '', notes, obs: access === 'full' ? (e.obs || {}) : {}, incidents: incidents.get(String(e._id)) || [] }
      // sceau d'authenticité du bulletin, calculé par le serveur (consultation complète seulement)
      if (access === 'full') dto.ref = e.ref
      if (access === 'full') dto.seals = Object.fromEntries([0, 1, 2, 3].map(p => [p, sealCode({ school: classe.school, annee: classe.annee, eleve: e, classe, period: p }, dto.incidents)]))
      // dossier d'inscription et coordonnées des parents : administration seulement
      if (isOffice(user)) Object.assign(dto, {
        status: e.status || 'enrolled', parentName: e.parentName || '', parentPhone: e.parentPhone || '', parentEmail: e.parentEmail || '', remise: e.remise || 0, ...extraDto(e),
      })
      return dto
    }),
  }
}
