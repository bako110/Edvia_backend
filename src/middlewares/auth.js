import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { School, User } from '../models/index.js'
import { isArchiveYear } from '../utils/year.js'
import { licenseValid } from '../utils/licenseState.js'
import { unauthorized, forbidden, paymentRequired, licenseLogout } from '../utils/errors.js'

// seules routes ouvertes quand la licence est expirée ou annulée : savoir où on en est, et la renouveler
const LICENSE_OPEN = ['/api/me', '/api/licence']

// Vérifie le jeton et recharge l'utilisateur : un compte désactivé est refusé immédiatement
export async function authenticate(req, res, next) {
  const h = req.headers.authorization || ''
  let payload
  try { payload = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', config.jwtSecret) }
  catch { throw unauthorized('Session expirée, reconnectez-vous') }
  const user = /^[0-9a-f]{24}$/i.test(payload.uid) ? await User.findById(payload.uid) : null
  if (!user || !user.active) throw unauthorized('Compte désactivé ou introuvable')
  if (payload.tv !== (user.tokenVersion || 0)) throw unauthorized('Session expirée, reconnectez-vous')   // mot de passe, rôle ou statut modifié depuis
  // année scolaire affichée à tous (choisie par l'administrateur) ; seules les années TERMINÉES sont en consultation seule pour les enseignants
  const school = await School.findById(user.school).select('annee annees licenseExpires licenseStatus')
  if (!licenseValid(school)) {
    const revoked = school.licenseStatus === 'revoked'
    // enseignants et personnel : session refusée partout (même /me), l'interface les déconnecte tout de suite
    if (user.role !== 'admin') throw licenseLogout(revoked ? 'Licence suspendue : l’accès de votre établissement est suspendu. Prévenez l’administrateur.' : 'Licence expirée : l’accès de votre établissement est suspendu. Prévenez l’administrateur.')
    // administrateur : il garde la main pour savoir où en est la licence et la renouveler, rien d'autre
    if (!LICENSE_OPEN.some(p => req.originalUrl.startsWith(p))) {
      throw paymentRequired(revoked ? 'Licence suspendue : contactez EDVIA.' : 'Licence expirée : renouvelez-la avec un nouveau code.')
    }
  }
  user.annee = school.annee
  user.ip = req.ip
  user.archive = isArchiveYear(school.annee)
  if (user.archive && user.role === 'teacher' && !req.originalUrl.startsWith('/api/me') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    throw forbidden('Année archivée : consultation seule pour les enseignants')
  }
  req.user = user
  next()
}

// Restreint une route à certains profils : authorize('admin', 'staff')
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden()
  next()
}
