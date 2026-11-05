import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { School, User } from '../models/index.js'
import { conflict, badRequest, forbidden, unauthorized } from '../utils/errors.js'
import { makeLimiter } from '../utils/loginLimiter.js'

const limiter = makeLimiter()
const sign = user => jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: config.jwtExpires })
const session = (user, school) => ({ token: sign(user), user, school })

// Nouvel établissement + son compte administrateur
export async function register({ school, name, login, password }) {
  if (await User.exists({ login })) throw conflict('Cet identifiant est déjà utilisé')
  const sch = await School.create({ name: school })
  try {
    const user = new User({ school: sch._id, login, name, role: 'admin' })
    user.setPassword(password)
    await user.save()
    return session(user, sch)
  } catch (e) {
    await School.deleteOne({ _id: sch._id })   // pas d'établissement orphelin
    throw e
  }
}

export async function login(ip, { login, password }) {
  const key = `${ip}|${login}`
  limiter.check(key)
  const user = await User.findOne({ login }).select('+salt +hash')
  // même message pour « inconnu » et « mauvais mot de passe »
  if (!user || !user.checkPassword(password)) { limiter.fail(key); throw unauthorized('Identifiant ou mot de passe incorrect') }
  if (!user.active) throw forbidden('Ce compte est désactivé. Contactez l’administrateur.')
  limiter.reset(key)
  return session(user, await School.findById(user.school))
}

export async function me(user) {
  return { user, school: await School.findById(user.school) }
}

export async function changePassword(user, { old, password }) {
  const u = await User.findById(user.id).select('+salt +hash')
  if (!u.checkPassword(old)) throw badRequest('Ancien mot de passe incorrect')
  u.setPassword(password)
  u.mustChange = false
  await u.save()
}
