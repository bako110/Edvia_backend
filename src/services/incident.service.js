import { Classe, Eleve, Incident } from '../models/index.js'
import { lockedMessage } from '../utils/locks.js'
import { audit } from './audit.service.js'
import { badRequest, forbidden, notFound } from '../utils/errors.js'
import { incidentRefusal, canDeleteIncident, canJustify } from '../policies/access.js'
import { findClasse } from './classe.service.js'

export const toDto = i => ({
  id: String(i._id), tr: i.tr, type: i.type, date: new Date(i.date).toISOString().slice(0, 10),
  matiereId: i.matiere ? String(i.matiere) : null, points: i.points, minutes: i.minutes, hours: i.hours,
  justified: !!i.justified, label: i.label, motif: i.motif, by: i.by ? String(i.by) : null, byName: i.byName,
})

// Enregistre un événement de vie scolaire pour un élève
export async function create(user, eleveId, data) {
  const eleve = await Eleve.findOne({ _id: eleveId, school: user.school })
  if (!eleve) throw notFound('Élève introuvable')
  const classe = await findClasse(user, eleve.classe)
  const matiere = data.matiereId ? classe.matieres.id(data.matiereId) : null
  if (data.matiereId && !matiere) throw notFound('Matière introuvable pour cette classe')
  const refus = incidentRefusal(user, classe, data.type, matiere)
  if (refus) throw forbidden(refus)

  const t = data.type
  // une pénalité modifie les moyennes : impossible sur un trimestre verrouillé
  if (t === 'penalite' && classe.locked?.[data.tr]) throw forbidden(lockedMessage(classe, data.tr))
  if (t === 'penalite' || t === 'sanction') await audit(user, t, { classe: classe._id, eleve: eleve._id, detail: { tr: data.tr, points: data.points, label: data.label, motif: data.motif, matiere: matiere?.name } })
  const doc = await Incident.create({
    school: user.school, classe: classe._id, eleve: eleve._id, tr: data.tr, type: t,
    date: data.date ? new Date(data.date) : new Date(),
    matiere: t === 'penalite' && matiere ? matiere._id : null,
    points: t === 'penalite' ? data.points : 0,
    minutes: t === 'retard' ? data.minutes || 0 : 0,
    hours: t === 'absence' ? data.hours : 0,
    justified: t === 'absence' ? !!data.justified : false,
    label: data.label || '', motif: data.motif || '',
    by: user._id, byName: user.name,
  })
  return toDto(doc)
}

// L'administration justifie (ou annule la justification d') une absence, par exemple à réception d'un certificat
export async function update(user, id, { justified }) {
  if (!canJustify(user)) throw forbidden('Seule l’administration justifie les absences')
  const inc = await Incident.findOne({ _id: id, school: user.school })
  if (!inc) throw notFound('Événement introuvable')
  if (inc.type !== 'absence') throw badRequest('Seules les absences peuvent être justifiées')
  await audit(user, 'absence_justifiee', { classe: inc.classe, eleve: inc.eleve, detail: { tr: inc.tr, heures: inc.hours, de: inc.justified, a: justified } })
  inc.justified = justified
  await inc.save()
  return toDto(inc)
}

export async function remove(user, id) {
  const inc = await Incident.findOne({ _id: id, school: user.school })
  if (!inc) throw notFound('Événement introuvable')
  if (!canDeleteIncident(user, inc)) throw forbidden('Vous ne pouvez supprimer que vos propres signalements')
  const classe = await Classe.findById(inc.classe)
  if (inc.type === 'penalite' && classe?.locked?.[inc.tr]) throw forbidden(lockedMessage(classe, inc.tr))
  await audit(user, 'incident_supprime', { classe: inc.classe, eleve: inc.eleve, detail: { type: inc.type, tr: inc.tr, points: inc.points, label: inc.label, motif: inc.motif, par: inc.byName } })
  await inc.deleteOne()
}

// Événements d'une classe, regroupés par élève. Un enseignant simple ne voit que ceux qu'il a saisis.
export async function forClasse(user, classe, access) {
  const filter = { classe: classe._id, ...(access === 'teacher' ? { by: user._id } : {}) }
  const list = await Incident.find(filter).sort('date createdAt').lean()
  const by = new Map()
  for (const i of list) { const k = String(i.eleve); (by.get(k) || by.set(k, []).get(k)).push(toDto(i)) }
  return by
}
