import { HttpError } from './errors.js'

// Nombre lu dans l'environnement (0 accepté), sinon valeur par défaut
export const envNum = (name, def) => { const v = process.env[name]; return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def }

// Limiteur de débit en mémoire : `max` requêtes par fenêtre et par clé (adresse IP). Nettoyage périodique.
export function rateLimit({ max, windowMs = 60_000, message = 'Trop de requêtes. Patientez un instant.', key = req => req.ip }) {
  const hits = new Map()
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k) }, windowMs).unref()
  return (req, res, next) => {
    const limit = typeof max === 'function' ? max() : max
    const k = key(req), now = Date.now()
    let h = hits.get(k)
    if (!h || now - h.start > windowMs) { h = { start: now, n: 0 }; hits.set(k, h) }
    if (++h.n > limit) {
      res.set('Retry-After', String(Math.ceil((h.start + windowMs - now) / 1000)))
      throw new HttpError(429, message)
    }
    next()
  }
}
