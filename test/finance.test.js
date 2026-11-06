import { test } from 'node:test'
import assert from 'node:assert/strict'
import { situation, remaining, buildTranches, scaleTranches } from '../src/utils/finance.js'

const plan = {
  inscription: 10000, scolarite: 90000,
  tranches: [{ label: 'T1', amount: 30000, due: '2026-10-15' }, { label: 'T2', amount: 30000, due: '2027-01-15' }, { label: 'T3', amount: 30000, due: '2027-04-15' }],
}
const at = d => new Date(d + 'T12:00:00Z')

test('échéancier : les versements couvrent les tranches dans l’ordre', () => {
  const s = situation(plan, { remise: 0 }, [{ kind: 'inscription', amount: 10000 }, { kind: 'scolarite', amount: 45000 }], at('2027-02-01'))
  assert.deepEqual(s.tranches.map(t => [t.paid, t.state]), [[30000, 'paye'], [15000, 'en_retard'], [0, 'a_venir']])
  assert.deepEqual([s.due, s.paid, s.balance, s.retard, s.state], [100000, 55000, 45000, 15000, 'en_retard'])
})

test('avant l’échéance : en cours, pas en retard ; l’inscription impayée est due tout de suite', () => {
  assert.equal(situation(plan, {}, [{ kind: 'inscription', amount: 10000 }], at('2026-09-01')).state, 'en_cours')
  const s = situation(plan, {}, [], at('2026-09-01'))
  assert.deepEqual([s.state, s.retard], ['en_retard', 10000])
  assert.equal(situation(plan, { status: 'pending' }, [], at('2026-09-01')).state, 'en_cours', 'dossier en attente : pas de relance')
})

test('soldé, retiré, frais non définis', () => {
  assert.equal(situation(plan, {}, [{ kind: 'inscription', amount: 10000 }, { kind: 'scolarite', amount: 90000 }], at('2027-06-01')).state, 'solde')
  assert.equal(situation(plan, { status: 'withdrawn' }, [], at('2027-06-01')).state, 'retire')
  assert.equal(situation(null, {}, [{ kind: 'scolarite', amount: 500 }]).state, 'aucun')
})

test('remise : tranches ajustées au prorata, total exact', () => {
  const t = scaleTranches(plan.tranches, 90000, 70000)
  assert.equal(t.reduce((s, x) => s + x.amount, 0), 70000)
  assert.deepEqual(t.map(x => x.amount), [23333, 23333, 23334])
  const s = situation(plan, { remise: 20000 }, [])
  assert.equal(s.due, 80000)
  assert.equal(remaining(plan, { remise: 20000 }, [{ kind: 'scolarite', amount: 20000 }], 'scolarite'), 50000)
  assert.equal(remaining(plan, {}, [{ kind: 'inscription', amount: 10000 }], 'inscription'), 0)
})

test('modalités de paiement générées', () => {
  assert.deepEqual(buildTranches('annuel', 90000, 2026).map(t => [t.amount, t.due]), [[90000, '2026-10-15']])
  const tri = buildTranches('trimestriel', 100000, 2026)
  assert.deepEqual(tri.map(t => t.amount), [33333, 33333, 33334]); assert.equal(tri[1].due, '2027-01-15')
  const men = buildTranches('mensuel', 90000, 2026)
  assert.equal(men.length, 9); assert.equal(men.reduce((s, t) => s + t.amount, 0), 90000); assert.equal(men[0].due, '2026-10-10'); assert.equal(men[8].due, '2027-06-10')
  assert.deepEqual(buildTranches('personnalise', 1000, 2026), [])
})
