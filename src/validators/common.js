import { z } from 'zod'

export const objectId = (name = 'Identifiant') =>
  z.string({ required_error: `${name} est obligatoire`, invalid_type_error: `${name} invalide` }).regex(/^[0-9a-f]{24}$/i, `${name} invalide`)

// Texte rogné et borné
export const text = (name, { max = 120, min = 1 } = {}) =>
  z.string({ required_error: `${name} est obligatoire`, invalid_type_error: `${name} invalide` })
    .trim().min(min, `${name} est obligatoire`).max(max, `${name} : ${max} caractères maximum`)
export const optionalText = (name, max = 120) =>
  z.string({ invalid_type_error: `${name} invalide` }).trim().max(max, `${name} : ${max} caractères maximum`)

export const loginField = z.string({ required_error: 'Identifiant obligatoire', invalid_type_error: 'Identifiant invalide' })
  .trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, 'Identifiant : lettres, chiffres, point, tiret ou underscore (3 à 32 caractères)')
const WEAK = new Set(['motdepasse', 'password', 'password1', '12345678', '123456789', '1234567890', 'azertyuiop', 'azerty123', 'qwertyuiop', 'qwerty123', 'admin1234', 'edvia2026', 'iloveyou1', 'burkina226', 'burkinafaso1'])
export const passwordField = z.string({ required_error: 'Mot de passe obligatoire', invalid_type_error: 'Mot de passe invalide' })
  .min(8, 'Mot de passe : au moins 8 caractères').max(100, 'Mot de passe : 100 caractères maximum')
  .refine(v => /[A-Za-z]/.test(v) && /\d/.test(v), 'Mot de passe : au moins une lettre et un chiffre')
  .refine(v => !WEAK.has(v.toLowerCase()), 'Mot de passe trop courant : choisissez-en un plus difficile à deviner')

export const idParams = z.object({ id: objectId() })
export const roleField = z.enum(['admin', 'teacher', 'staff'], { errorMap: () => ({ message: 'Rôle invalide' }) })
export const coefField = z.coerce.number({ invalid_type_error: 'Coefficient invalide' }).min(0.5, 'Coefficient : entre 0,5 et 20').max(20, 'Coefficient : entre 0,5 et 20')
