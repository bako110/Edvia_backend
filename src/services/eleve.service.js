import { Eleve, Incident } from '../models/index.js'
import { forbidden, notFound } from '../utils/errors.js'
import { canManageEleves, canWriteObs } from '../policies/access.js'
import { findClasse } from './classe.service.js'

async function findEleve(user, id) {
  const eleve = await Eleve.findOne({ _id: id, school: user.school })
  if (!eleve) throw notFound('Élève introuvable')
  return { eleve, classe: await findClasse(user, eleve.classe) }
}
function mustManage(user) {
  if (!canManageEleves(user)) throw forbidden('Seule l’administration enregistre et modifie les élèves')
}

// Ajout en lot : lignes « NOM Prénom » ou « NOM Prénom ; matricule » (doublons ignorés)
export async function add(user, classeId, { names }) {
  mustManage(user)
  const classe = await findClasse(user, classeId)
  const existing = new Set((await Eleve.find({ classe: classe._id }).select('name')).map(e => e.name))
  const docs = [], seen = new Set()
  let skipped = 0
  for (const line of names) {
    const [n, m = ''] = line.split(';')
    const name = n.replace(/\s+/g, ' ').trim().slice(0, 100)
    if (!name || existing.has(name) || seen.has(name)) { skipped++; continue }
    seen.add(name)
    docs.push({ school: user.school, classe: classe._id, name, matricule: m.trim().slice(0, 30) })
  }
  if (docs.length) await Eleve.insertMany(docs, { ordered: false })
  return { added: docs.length, skipped }
}

export async function update(user, id, data) {
  mustManage(user)
  const { eleve } = await findEleve(user, id)
  if (data.name !== undefined) eleve.name = data.name
  if (data.matricule !== undefined) eleve.matricule = data.matricule
  await eleve.save()
}

export async function remove(user, id) {
  mustManage(user)
  const { eleve } = await findEleve(user, id)
  await Incident.deleteMany({ eleve: eleve._id })
  await eleve.deleteOne()
}

// Observation du conseil de classe (période 0..2 = trimestres, 3 = année)
export async function setObs(user, id, { tr, text }) {
  const { eleve, classe } = await findEleve(user, id)
  if (!canWriteObs(user, classe)) throw forbidden('Réservé à l’administration et au professeur principal')
  await Eleve.updateOne({ _id: eleve._id }, { $set: { [`obs.${tr}`]: text } })
}
