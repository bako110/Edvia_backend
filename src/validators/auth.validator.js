import { z } from 'zod'
import { text, loginField, passwordField } from './common.js'

export const registerBody = z.object({
  school: text('Nom de l’établissement'),
  name: text('Nom de l’administrateur', { max: 80 }),
  login: loginField,
  password: passwordField,
})
export const loginBody = z.object({
  login: z.string().trim().toLowerCase().default(''),
  password: z.string().default(''),
})
export const changePasswordBody = z.object({
  old: z.string({ required_error: 'Ancien mot de passe obligatoire' }),
  password: passwordField,
})
