import { audit } from './audit.service.js'
import mongoose from 'mongoose'
import { Classe, Eleve, FeePlan, Paiement, School } from '../models/index.js'
import { badRequest, notFound } from '../utils/errors.js'
import { situation, remaining, buildTranches } from '../utils/finance.js'
import { findClasse } from './classe.service.js'

const day = d => new Date(d).toISOString().slice(0, 10)

export const planDto = p => p && ({
  capacity: p.capacity, inscription: p.inscription, scolarite: p.scolarite, modalite: p.modalite,
  tranches: p.tranches.map(t => ({ label: t.label, amount: t.amount, due: day(t.due) })),
})
export const paiementDto = p => ({
  id: String(p._id), kind: p.kind, amount: p.amount, method: p.method, reference: p.reference,
  date: day(p.date), receipt: p.receipt, byName: p.byName,
})

/* ---------- plan de frais d'une classe ---------- */
export async function getPlan(user, classeId) {
  const classe = await findClasse(user, classeId)
  return { classe: { id: classe.id, name: classe.name }, plan: planDto(await FeePlan.findOne({ classe: classe._id })) }
}

export async function setPlan(user, classeId, data) {
  const classe = await findClasse(user, classeId)
  let tranches = data.tranches || []
  if (data.scolarite > 0) {
    if (!tranches.length && data.modalite !== 'personnalise') {
      const school = await School.findById(user.school).select('annee')
      tranches = buildTranches(data.modalite, data.scolarite, parseInt(school?.annee, 10) || new Date().getFullYear())
    }
    if (!tranches.length) throw badRequest('Ajoutez au moins une échéance de paiement')
    if (data.modalite === 'annuel' && tranches.length !== 1) throw badRequest('Un paiement annuel comporte une seule échéance')
    const total = tranches.reduce((s, t) => s + t.amount, 0)
    if (total !== data.scolarite) throw badRequest(`La somme des échéances (${total.toLocaleString('fr-FR')}) doit être égale à la scolarité (${data.scolarite.toLocaleString('fr-FR')})`)
  } else tranches = []
  const plan = await FeePlan.findOneAndUpdate(
    { classe: classe._id },
    { $set: { school: user.school, capacity: data.capacity, inscription: data.inscription, scolarite: data.scolarite, modalite: data.modalite, tranches } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )
  return planDto(plan)
}

/* ---------- situation des élèves ---------- */
// Situation financière de chaque élève d'une liste de classes : Map(eleveId -> situation + versements)
export async function situations(school, classes, now = new Date()) {
  const ids = classes.map(c => c._id)
  const [plans, eleves, paiements] = await Promise.all([
    FeePlan.find({ classe: { $in: ids } }).lean(),
    Eleve.find({ classe: { $in: ids } }).collation({ locale: 'fr' }).sort('name').lean(),
    Paiement.find({ classe: { $in: ids } }).sort('date createdAt').lean(),
  ])
  const planBy = new Map(plans.map(p => [String(p.classe), p]))
  const payBy = new Map()
  for (const p of paiements) { const k = String(p.eleve); (payBy.get(k) || payBy.set(k, []).get(k)).push(p) }
  return eleves.map(e => {
    const pays = payBy.get(String(e._id)) || []
    const plan = planBy.get(String(e.classe)) || null
    return { eleve: e, plan, paiements: pays, ...situation(plan, e, pays, now) }
  })
}

const summarize = rows => {
  const live = rows.filter(r => r.state !== 'retire')
  return {
    nbEleves: live.length, due: live.reduce((s, r) => s + r.due, 0), paid: rows.reduce((s, r) => s + r.paid, 0),
    balance: live.reduce((s, r) => s + r.balance, 0), nbSolde: live.filter(r => r.state === 'solde').length,
    nbRetard: live.filter(r => r.state === 'en_retard').length, retard: live.reduce((s, r) => s + r.retard, 0),
  }
}

// Détail d'une classe : plan + situation de chaque élève (administration)
export async function classFinance(user, classeId) {
  const classe = await findClasse(user, classeId)
  const rows = await situations(user.school, [classe])
  return {
    classe: { id: classe.id, name: classe.name },
    plan: planDto(await FeePlan.findOne({ classe: classe._id })),
    totals: summarize(rows),
    eleves: rows.map(r => ({
      id: String(r.eleve._id), name: r.eleve.name, matricule: r.eleve.matricule || '', status: r.eleve.status, remise: r.eleve.remise || 0,
      parentName: r.eleve.parentName || '', parentPhone: r.eleve.parentPhone || '',
      due: r.due, paid: r.paid, balance: r.balance, retard: r.retard, state: r.state,
      inscription: r.inscription, tranches: r.tranches, paiements: r.paiements.map(paiementDto).reverse(),
    })),
  }
}

// Vue d'ensemble de l'établissement : une ligne par classe
export async function overview(user) {
  const classes = await Classe.find({ school: user.school, annee: user.annee }).sort('name')
  const rows = await situations(user.school, classes)
  const plans = new Set((await FeePlan.find({ school: user.school }).select('classe')).map(p => String(p.classe)))
  const list = classes.map(c => ({
    id: c.id, name: c.name, hasPlan: plans.has(c.id),
    ...summarize(rows.filter(r => String(r.eleve.classe) === c.id)),
  }))
  return { total: summarize(rows), classes: list }
}

/* ---------- versements ---------- */
export async function addPaiement(user, eleveId, { kind, amount, method, reference, date }) {
  const eleve = await Eleve.findOne({ _id: eleveId, school: user.school })
  if (!eleve) throw notFound('Élève introuvable')
  const plan = await FeePlan.findOne({ classe: eleve.classe }).lean()
  if (!plan) throw badRequest('Définissez d’abord les frais de cette classe')
  const pays = await Paiement.find({ eleve: eleve._id }).lean()
  const left = remaining(plan, eleve, pays, kind)
  if (left === 0) throw badRequest(kind === 'inscription' ? 'L’inscription est déjà entièrement réglée' : 'La scolarité est déjà entièrement réglée')
  if (amount > left) throw badRequest(`Montant trop élevé : il reste ${left.toLocaleString('fr-FR')} FCFA à payer`)
  const _id = new mongoose.Types.ObjectId()
  const when = date ? new Date(date) : new Date()
  await audit(user, 'paiement', { classe: eleve.classe, eleve: eleve._id, detail: { type: kind, montant: amount, moyen: method, reference: reference || '' } })
  const doc = await Paiement.create({
    _id, school: user.school, classe: eleve.classe, eleve: eleve._id, kind, amount, method, reference: reference || '',
    date: when, receipt: `R${day(when).replace(/-/g, '').slice(2)}-${String(_id).slice(-5).toUpperCase()}`,
    by: user._id, byName: user.name,
  })
  return paiementDto(doc)
}

export async function removePaiement(user, id) {
  const p = await Paiement.findOne({ _id: id, school: user.school })
  if (!p) throw notFound('Versement introuvable')
  await audit(user, 'paiement_annule', { classe: p.classe, eleve: p.eleve, detail: { type: p.kind, montant: p.amount, recu: p.receipt } })
  await p.deleteOne()
}
