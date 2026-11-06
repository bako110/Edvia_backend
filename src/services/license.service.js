import crypto from 'node:crypto'
import { Classe, Eleve, License, School } from '../models/index.js'
import { badRequest, forbidden, notFound } from '../utils/errors.js'
import { daysLeft, licenseValid } from '../utils/licenseState.js'

const DAY = 86_400_000
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'   // sans caractères ambigus

// EDV-XXXX-XXXX-XXXX-XXXX (80 bits : impossible à deviner)
export function generateCode() {
  const b = crypto.randomBytes(16)
  let s = ''
  for (let i = 0; i < 16; i++) s += ALPHABET[b[i] % ALPHABET.length]
  return `EDV-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`
}

// Saisie tolérante : minuscules, espaces, tirets manquants
export function normalizeCode(raw) {
  const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = c.startsWith('EDV') ? c.slice(3) : c
  return body.length === 16 ? `EDV-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12)}` : String(raw || '').trim().toUpperCase()
}

/* ---------- activation (création d'un établissement ou renouvellement) ---------- */

// Réserve un code pour un établissement, de façon atomique : deux personnes ne peuvent pas utiliser le même code
export async function claim(code, schoolId) {
  const lic = await License.findOneAndUpdate(
    { code: normalizeCode(code), school: null, status: 'active' },
    { $set: { school: schoolId, usedAt: new Date() } }, { new: true })
  // même message dans tous les cas : on ne révèle pas si un code existe
  if (!lic) throw badRequest('Code de licence invalide, déjà utilisé ou annulé')
  return lic
}
export const release = licId => License.updateOne({ _id: licId }, { $set: { school: null, usedAt: null, expiresAt: null } })

// Applique une licence réservée à un établissement : la durée s'ajoute à ce qu'il lui reste
export async function applyTo(school, lic, now = new Date()) {
  const base = licenseValid(school, now) ? new Date(school.licenseExpires) : now
  const expires = new Date(base.getTime() + lic.days * DAY)
  school.licenseExpires = expires
  school.licenseStatus = 'active'
  school.licenseCode = lic.code
  school.maxStudents = lic.maxStudents
  await School.updateOne({ _id: school._id }, { $set: { licenseExpires: expires, licenseStatus: 'active', licenseCode: lic.code, maxStudents: lic.maxStudents } })
  await License.updateOne({ _id: lic._id }, { $set: { expiresAt: expires } })
  return expires
}

// Renouvellement par l'administrateur de l'établissement
export async function renew(user, { code }) {
  const school = await School.findById(user.school).select('+licenseCode')
  const lic = await claim(code, school._id)
  try { await applyTo(school, lic) } catch (e) { await release(lic._id); throw e }
  return School.findById(user.school)
}

/* ---------- état et limites ---------- */
export async function studentCount(schoolId, annee) {
  const classes = await Classe.find({ school: schoolId, ...(annee ? { annee } : {}) }).select('_id')
  return Eleve.countDocuments({ school: schoolId, classe: { $in: classes.map(c => c._id) }, status: { $ne: 'withdrawn' } })
}

export async function status(user) {
  const school = await School.findById(user.school)
  const students = await studentCount(user.school, user.annee)
  return {
    valid: licenseValid(school), expires: school.licenseExpires, daysLeft: daysLeft(school),
    revoked: school.licenseStatus === 'revoked', maxStudents: school.maxStudents || 0, students,
  }
}

// Refuse d'ajouter des élèves au-delà de la limite de la licence
export async function assertCapacity(user, adding = 1) {
  const school = await School.findById(user.school).select('maxStudents')
  const max = school?.maxStudents || 0
  if (!max) return
  const n = await studentCount(user.school, user.annee)
  if (n + adding > max) throw forbidden(`Limite de la licence atteinte : ${max} élève${max > 1 ? 's' : ''} au maximum (${n} déjà inscrit${n > 1 ? 's' : ''}). Contactez EDVIA pour étendre votre licence.`)
}

/* ---------- propriétaire de la plateforme ---------- */
export async function ownerCreate({ days, maxStudents = 0, note = '', count = 1 }) {
  const docs = []
  for (let i = 0; i < count; i++) docs.push({ code: generateCode(), days, maxStudents, note })
  return (await License.insertMany(docs)).map(d => ownerDto(d))
}

const ownerDto = (d, school) => ({
  code: d.code, days: d.days, maxStudents: d.maxStudents, note: d.note, status: d.status,
  usedAt: d.usedAt, expiresAt: d.expiresAt, school: school ? { id: String(school._id), name: school.name } : null,
  state: d.status === 'revoked' ? 'annulee' : !d.school ? 'libre' : d.expiresAt && new Date(d.expiresAt) < new Date() ? 'expiree' : 'active',
})

export async function ownerList() {
  const list = await License.find().sort('-createdAt').limit(500).lean()
  const schools = await School.find({ _id: { $in: list.map(l => l.school).filter(Boolean) } }).select('name')
  const by = new Map(schools.map(s => [String(s._id), s]))
  return list.map(l => ownerDto(l, l.school ? by.get(String(l.school)) : null))
}

async function findLicense(code) {
  const lic = await License.findOne({ code: normalizeCode(code) })
  if (!lic) throw notFound('Licence introuvable')
  return lic
}

// Annuler : l'établissement est verrouillé tout de suite. Rétablir : il retrouve l'accès.
export async function ownerSetStatus(code, status) {
  const lic = await findLicense(code)
  lic.status = status
  await lic.save()
  if (lic.school) await School.updateOne({ _id: lic.school, licenseCode: lic.code }, { $set: { licenseStatus: status } })
  return ownerDto(lic)
}

// Prolonger de N jours (licence déjà activée : la date de fin de l'établissement recule aussi)
export async function ownerExtend(code, days) {
  const lic = await findLicense(code)
  if (!lic.school) { lic.days += days; await lic.save(); return ownerDto(lic) }
  const school = await School.findById(lic.school).select('+licenseCode')
  const base = school.licenseExpires && new Date(school.licenseExpires) > new Date() ? new Date(school.licenseExpires) : new Date()
  const expires = new Date(base.getTime() + days * DAY)
  await School.updateOne({ _id: school._id }, { $set: { licenseExpires: expires, ...(school.licenseCode === lic.code ? { licenseStatus: lic.status } : {}) } })
  lic.expiresAt = expires
  await lic.save()
  return ownerDto(lic, school)
}

// Étape 1 de la création d'un établissement : le code est-il utilisable ? (il n'est PAS consommé ici)
// Réponse identique pour « inconnu », « déjà utilisé » et « annulé » : on ne révèle rien d'autre que la durée et la limite.
export async function check(code) {
  const lic = await License.findOne({ code: normalizeCode(code), school: null, status: 'active' }).select('days maxStudents')
  if (!lic) throw badRequest('Code de licence invalide, déjà utilisé ou annulé')
  return { valid: true, days: lic.days, maxStudents: lic.maxStudents }
}
