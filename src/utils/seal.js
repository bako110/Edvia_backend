import crypto from 'node:crypto'
import { config } from '../config/env.js'

/*
 * Sceau d'authenticité d'un bulletin : empreinte HMAC-SHA-256, calculée par le SERVEUR avec un secret que personne
 * d'autre ne possède, sur TOUT ce qui détermine les moyennes (notes, coefficients, pénalités) pour l'élève et la période.
 * Un bulletin imprimé dont une note a été retouchée à la main, ou dont le code est inventé, ne passera pas la vérification.
 * Si une note est légitimement corrigée après l'impression, l'ancien code cesse d'être valide : seul le bulletin à jour l'est.
 */
const key = () => crypto.createHmac('sha256', process.env.SEAL_SECRET || config.jwtSecret).update('edvia-bulletin-seal-v1').digest()

// Période 0..2 = trimestre, 3 = année complète
export function canonical({ school, annee, eleve, classe, period }, incidents) {
  const periods = period === 3 ? [0, 1, 2] : [period]
  const coefs = classe.matieres.map(m => [String(m._id), m.coef]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const notes = periods.map(p => {
    const byM = eleve.notes?.[p] || {}
    return [p, Object.keys(byM).sort().map(m => [m, byM[m].d1 || '', byM[m].d2 || '', byM[m].c || '']).filter(r => r[1] || r[2] || r[3])]
  })
  const pens = (incidents || []).filter(i => i.type === 'penalite' && periods.includes(i.tr))
    .map(i => [i.tr, (i.matiere ?? i.matiereId) ? String(i.matiere ?? i.matiereId) : 'g', i.points]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
  return JSON.stringify({ v: 1, school: String(school), annee, eleve: String(eleve._id), classe: String(classe._id), period, coefs, notes, pens })
}

const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'   // sans caractères ambigus (0/O, 1/I/L)
export function sealCode(data, incidents) {
  const h = crypto.createHmac('sha256', key()).update(canonical(data, incidents)).digest()
  let out = ''
  for (let i = 0; i < 12; i++) out += B32[h[i] % B32.length]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`
}

export const sameCode = (a, b) => {
  const x = Buffer.from(String(a).toUpperCase()), y = Buffer.from(String(b).toUpperCase())
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
