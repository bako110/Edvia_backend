import { HttpError } from './errors.js'

// Limiteur d'essais en mémoire : `max` échecs par fenêtre et par clé (IP + identifiant,
// pour ne pas bloquer tout un établissement derrière une même adresse IP)
export function makeLimiter(max = 8, windowMs = 10 * 60 * 1000) {
  const hits = new Map()
  return {
    check(key) {
      const now = Date.now(), h = (hits.get(key) || []).filter(t => now - t < windowMs)
      hits.set(key, h)
      if (h.length >= max) throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.')
    },
    fail(key) { const h = hits.get(key) || []; h.push(Date.now()); hits.set(key, h) },
    reset(key) { hits.delete(key) },
  }
}
