import { audit } from './audit.service.js'
import { User, Classe } from '../models/index.js'
import { badRequest, notFound } from '../utils/errors.js'

async function findInSchool(user, id) {
  const u = await User.findOne({ _id: id, school: user.school })
  if (!u) throw notFound('Utilisateur introuvable')
  return u
}
const isLastAdmin = async u =>
  u.role === 'admin' && (await User.countDocuments({ school: u.school, role: 'admin', active: true })) <= 1

export async function list(user) {
  const [users, classes] = await Promise.all([
    User.find({ school: user.school }).sort({ role: 1, name: 1 }),
    Classe.find({ school: user.school, annee: user.annee }).select('matieres.teacher'),
  ])
  const count = new Map()
  for (const c of classes) for (const m of c.matieres) if (m.teacher) count.set(String(m.teacher), (count.get(String(m.teacher)) || 0) + 1)
  return users.map(u => ({ ...u.toJSON(), nbMatieres: count.get(u.id) || 0 }))
}

// L'administrateur crée le compte avec un mot de passe provisoire (à changer à la 1re connexion)
export async function create(user, { login, name, role, password }) {
  const u = new User({ school: user.school, login, name, role, mustChange: true })
  u.setPassword(password)
  await u.save()
  await audit(user, 'compte_cree', { detail: { compte: login, role } })
  return { ...u.toJSON(), nbMatieres: 0 }
}

export async function update(user, id, data) {
  const u = await findInSchool(user, id)
  const role = data.role ?? u.role, active = data.active ?? u.active
  if ((role !== 'admin' || !active) && (await isLastAdmin(u))) throw badRequest('Il doit rester au moins un administrateur actif')
  if (role !== u.role || active !== u.active) u.tokenVersion = (u.tokenVersion || 0) + 1   // rôle changé ou compte désactivé : jetons révoqués
  await audit(user, 'compte_modifie', { detail: { compte: u.login, role: [u.role, role], actif: [u.active, active], nom: data.name && data.name !== u.name ? [u.name, data.name] : undefined } })
  Object.assign(u, { name: data.name ?? u.name, role, active })
  await u.save()
}

export async function resetPassword(user, id, { password }) {
  const u = await findInSchool(user, id)
  u.setPassword(password)
  u.mustChange = true
  u.tokenVersion = (u.tokenVersion || 0) + 1   // l'ancien mot de passe ET les sessions ouvertes sont invalidés
  await audit(user, 'mdp_reinitialise', { detail: { compte: u.login } })
  await u.save()
}
