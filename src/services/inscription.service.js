import { Classe, Eleve, FeePlan } from '../models/index.js'
import { conflict, forbidden } from '../utils/errors.js'
import { canManageEleves } from '../policies/access.js'
import { findClasse } from './classe.service.js'
import { addPaiement } from './finance.service.js'

// Inscription d'UN élève : identité, parent / tuteur, statut du dossier, remise, et versement éventuel du droit d'inscription
export async function enroll(user, classeId, data) {
  if (!canManageEleves(user)) throw forbidden('Seule l’administration enregistre les élèves')
  const classe = await findClasse(user, classeId)
  const plan = await FeePlan.findOne({ classe: classe._id }).lean()
  const status = data.status || 'enrolled'
  if (plan?.capacity > 0 && status !== 'withdrawn') {
    const n = await Eleve.countDocuments({ classe: classe._id, status: { $ne: 'withdrawn' } })
    if (n >= plan.capacity) throw conflict(`La ${classe.name} est complète (${plan.capacity} places)`)
  }
  const eleve = await Eleve.create({
    school: user.school, classe: classe._id, name: data.name, matricule: data.matricule || '', status,
    parentName: data.parentName || '', parentPhone: data.parentPhone || '', parentEmail: data.parentEmail || '', remise: data.remise || 0,
  })
  let paiement = null
  if (data.paiement) paiement = await addPaiement(user, eleve._id, { kind: 'inscription', method: 'especes', ...data.paiement })
  return { id: eleve.id, paiement }
}

// Effectifs par classe : inscrits, dossiers en attente, retraits, places restantes
export async function overview(user) {
  const [classes, counts, plans] = await Promise.all([
    Classe.find({ school: user.school, annee: user.annee }).sort('name'),
    Eleve.aggregate([{ $match: { school: user.school } }, { $group: { _id: { classe: '$classe', status: '$status' }, n: { $sum: 1 } } }]),
    FeePlan.find({ school: user.school }).select('classe capacity').lean(),
  ])
  const cap = new Map(plans.map(p => [String(p.classe), p.capacity]))
  const n = (c, s) => counts.find(x => String(x._id.classe) === c && x._id.status === s)?.n || 0
  const list = classes.map(c => {
    const enrolled = n(c.id, 'enrolled'), pending = n(c.id, 'pending'), withdrawn = n(c.id, 'withdrawn'), capacity = cap.get(c.id) || 0
    return { id: c.id, name: c.name, enrolled, pending, withdrawn, capacity, free: capacity ? Math.max(0, capacity - enrolled - pending) : null }
  })
  const sum = k => list.reduce((s, c) => s + c[k], 0)
  return { total: { enrolled: sum('enrolled'), pending: sum('pending'), withdrawn: sum('withdrawn') }, classes: list }
}
