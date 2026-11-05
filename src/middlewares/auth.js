import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { User } from '../models/index.js'
import { unauthorized, forbidden } from '../utils/errors.js'

// Vérifie le jeton et recharge l'utilisateur : un compte désactivé est refusé immédiatement
export async function authenticate(req, res, next) {
  const h = req.headers.authorization || ''
  let payload
  try { payload = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', config.jwtSecret) }
  catch { throw unauthorized('Session expirée, reconnectez-vous') }
  const user = /^[0-9a-f]{24}$/i.test(payload.uid) ? await User.findById(payload.uid) : null
  if (!user || !user.active) throw unauthorized('Compte désactivé ou introuvable')
  req.user = user
  next()
}

// Restreint une route à certains profils : authorize('admin', 'staff')
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden()
  next()
}
