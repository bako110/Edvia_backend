import { Eleve, Classe, User } from '../models/index.js'
import { forbidden, notFound } from '../utils/errors.js'
import { canEnterNote } from '../policies/access.js'
import { lockedMessage } from '../utils/locks.js'
import { audit } from './audit.service.js'

const COLS = ['d1', 'd2', 'c']   // liste blanche : aucune valeur client n'entre dans un nom de champ

// Saisie d'une seule note (devoir 1, devoir 2 ou composition) — mise à jour atomique du champ
export async function set(user, { eleveId, matiereId, tr, k, value }) {
  const eleve = await Eleve.findOne({ _id: eleveId, school: user.school }).select('classe')
  if (!eleve) throw notFound('Élève introuvable')
  const classe = await Classe.findById(eleve.classe)
  const matiere = classe.matieres.id(matiereId)
  if (!matiere) throw notFound('Matière introuvable pour cette classe')
  if (!canEnterNote(user, matiere)) throw forbidden(`Vous n’enseignez pas « ${matiere.name} » dans cette classe`)
  if (classe.locked?.[tr]) throw forbidden(lockedMessage(classe, tr))   // même l'administrateur doit d'abord déverrouiller (et c'est journalisé)
  const path = `notes.${tr}.${matiere.id}`
  // traçabilité : ancienne et nouvelle valeur, auteur, date, adresse — écrites AVANT la modification (sans trace, pas de modification)
  const cur = (await Eleve.findById(eleve._id).select(path).lean())?.notes?.[tr]?.[matiere.id] || {}
  const from = cur[COLS[k]] ?? ''
  if (from !== value) await audit(user, 'note', { classe: classe._id, eleve: eleve._id, detail: { matiere: matiere.name, tr, colonne: COLS[k], de: from, a: value } })
  await Eleve.updateOne({ _id: eleve._id }, { $set: { [`${path}.${COLS[k]}`]: value, [`${path}.by`]: user._id, [`${path}.at`]: new Date() } })
  return { value }
}

/*
 * Suivi : pour chaque matière de chaque classe, combien d'élèves ont au moins une note ce trimestre.
 * L'administration voit tout ; un enseignant ne voit que ses matières.
 */
export async function status(user, tr) {
  const [classes, eleves, users] = await Promise.all([
    Classe.find({ school: user.school, annee: user.annee }).sort('name'),
    Eleve.find({ school: user.school }).select(`classe notes.${tr}`).lean(),
    User.find({ school: user.school }).select('name active'),
  ])
  const who = new Map(users.map(u => [u.id, u]))
  const byClasse = new Map()
  for (const e of eleves) { const k = String(e.classe); (byClasse.get(k) || byClasse.set(k, []).get(k)).push(e) }

  const rows = []
  for (const c of classes) {
    const list = byClasse.get(c.id) || []
    for (const m of c.matieres) {
      if (user.role === 'teacher' && String(m.teacher) !== user.id) continue
      const filled = list.filter(e => { const n = e.notes?.[tr]?.[m.id]; return n && (n.d1 || n.d2 || n.c) }).length
      const t = who.get(String(m.teacher))
      rows.push({
        classId: c.id, className: c.name, matiereId: m.id, matiereName: m.name,
        teacherId: m.teacher ? String(m.teacher) : null, teacherName: t?.name || null, teacherActive: t ? t.active : false,
        total: list.length, filled,
      })
    }
  }
  return rows
}
