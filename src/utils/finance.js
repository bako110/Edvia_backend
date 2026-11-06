/*
 * Calculs financiers (fonctions pures, sans base de données — faciles à tester).
 * Montants en FCFA, entiers.
 */

const sum = (list, kind) => list.filter(p => p.kind === kind).reduce((s, p) => s + p.amount, 0)
const day = d => new Date(d).toISOString().slice(0, 10)

// Tranches ajustées à la scolarité réellement due par l'élève (après remise), la dernière absorbe l'arrondi
export function scaleTranches(tranches, scolarite, scolDue) {
  if (!tranches.length) return []
  if (scolDue === scolarite || scolarite <= 0) return tranches.map(t => ({ label: t.label, amount: t.amount, due: day(t.due) }))
  let used = 0
  return tranches.map((t, i) => {
    const amount = i === tranches.length - 1 ? scolDue - used : Math.round(t.amount * scolDue / scolarite)
    used += amount
    return { label: t.label, amount: Math.max(0, amount), due: day(t.due) }
  })
}

/*
 * Situation financière d'un élève.
 *  plan       : { inscription, scolarite, tranches:[{label, amount, due}] } ou null (frais non définis)
 *  eleve      : { remise, status }
 *  paiements  : [{ kind, amount }]
 * state : 'aucun' (frais non définis) · 'solde' · 'en_retard' (échéance dépassée non réglée) · 'en_cours' · 'retire'
 */
export function situation(plan, eleve, paiements, now = new Date()) {
  const paidInscription = sum(paiements, 'inscription'), paidScolarite = sum(paiements, 'scolarite')
  const paid = paidInscription + paidScolarite
  if (!plan) return { due: 0, paid, balance: 0, state: 'aucun', retard: 0, inscription: { due: 0, paid: paidInscription }, tranches: [] }

  const remise = Math.min(eleve.remise || 0, plan.scolarite)
  const inscDue = plan.inscription, scolDue = plan.scolarite - remise
  const due = inscDue + scolDue
  const tranches = scaleTranches(plan.tranches || [], plan.scolarite, scolDue)

  // les versements de scolarité couvrent les tranches dans l'ordre des échéances
  let rest = paidScolarite
  const today = day(now)
  let retard = inscDue > paidInscription && eleve.status !== 'pending' ? inscDue - paidInscription : 0
  for (const t of tranches) {
    t.paid = Math.min(rest, t.amount); rest -= t.paid
    const left = t.amount - t.paid
    t.state = left === 0 ? 'paye' : t.due < today ? 'en_retard' : t.paid > 0 ? 'partiel' : 'a_venir'
    if (t.state === 'en_retard') retard += left
  }

  const balance = due - paid
  let state = 'en_cours'
  if (eleve.status === 'withdrawn') state = 'retire'
  else if (due === 0) state = 'aucun'
  else if (balance <= 0) state = 'solde'
  else if (retard > 0) state = 'en_retard'
  return { due, paid, balance: Math.max(0, balance), state, retard, inscription: { due: inscDue, paid: paidInscription }, tranches }
}

// Reste à payer pour un type de versement (sert à refuser un trop-perçu)
export function remaining(plan, eleve, paiements, kind) {
  if (!plan) return 0
  const due = kind === 'inscription' ? plan.inscription : plan.scolarite - Math.min(eleve.remise || 0, plan.scolarite)
  return Math.max(0, due - sum(paiements, kind))
}

// Génère un échéancier : annuel (1), trimestriel (3), mensuel (9 mois, octobre → juin) ou à partir de dates données
export function buildTranches(modalite, scolarite, startYear) {
  const spec = {
    annuel: [['Paiement unique', 10, 15]],
    trimestriel: [['1er trimestre', 10, 15], ['2e trimestre', 1, 15], ['3e trimestre', 4, 15]],
    mensuel: [10, 11, 12, 1, 2, 3, 4, 5, 6].map((m, i) => [`Mensualité ${i + 1}`, m, 10]),
  }[modalite] || []
  let used = 0
  return spec.map(([label, month, d], i) => {
    const amount = i === spec.length - 1 ? scolarite - used : Math.floor(scolarite / spec.length)
    used += amount
    const y = month >= 8 ? startYear : startYear + 1
    return { label, amount, due: `${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  })
}
