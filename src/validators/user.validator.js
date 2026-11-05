import { z } from 'zod'
import { text, loginField, passwordField, roleField } from './common.js'

export const createUserBody = z.object({
  login: loginField,
  name: text('Nom', { max: 80 }),
  role: roleField,
  password: passwordField,
})
export const updateUserBody = z.object({
  name: text('Nom', { max: 80 }).optional(),
  role: roleField.optional(),
  active: z.boolean({ invalid_type_error: 'Valeur invalide' }).optional(),
})
export const resetPasswordBody = z.object({ password: passwordField })
