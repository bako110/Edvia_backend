import { Eleve, Incident } from '../models/index.js'
import { forbidden, notFound } from '../utils/errors.js'
import { incidentRefusal, canDeleteIncident } from '../policies/access.js'
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

export async function remove(user, id) {
  const inc = await Incident.findOne({ _id: id, school: user.school })
  if (!inc) throw notFound('Événement introuvable')
  if (!canDeleteIncident(user, inc)) throw forbidden('Vous ne pouvez supprimer que vos propres signalements')
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
