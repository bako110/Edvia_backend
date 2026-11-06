import mongoose from 'mongoose'
import { HttpError } from '../utils/errors.js'

export const notFoundApi = (req, res) => res.status(404).json({ error: 'Route introuvable' })

// Messages lisibles pour les violations d'unicité (index MongoDB)
const DUPLICATES = [
  ['login', 'Cet identifiant est déjà utilisé'],
  ['classe', 'Un élève porte déjà ce nom dans la classe'],
  ['name', 'Cette classe existe déjà'],
]

// Gestionnaire d'erreurs central : tout `throw` des couches inférieures arrive ici
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) })
  if (err.code === 11000) {
    const keys = Object.keys(err.keyPattern || {})
    const hit = DUPLICATES.find(([k]) => keys.includes(k))
    return res.status(409).json({ error: hit ? hit[1] : 'Cet élément existe déjà' })
  }
  if (err instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: Object.values(err.errors)[0].message })
  if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Identifiant invalide' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Données trop volumineuses' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' })
  console.error(err)
  res.status(500).json({ error: 'Erreur interne du serveur' })
}
