import { z } from 'zod'
import { objectId, text, coefField } from './common.js'

export const createClasseBody = z.object({ name: text('Nom de la classe', { max: 30 }), defaults: z.boolean().optional() })
export const updateClasseBody = z.object({
  name: text('Nom de la classe', { max: 30 }).optional(),
  principal: objectId('Professeur principal').nullable().optional(),
})

export const matiereParams = z.object({ id: objectId('Classe'), mid: objectId('Matière') })
export const lockBody = z.object({
  tr: z.coerce.number({ invalid_type_error: 'Trimestre invalide' }).int('Trimestre invalide').min(0, 'Trimestre invalide').max(2, 'Trimestre invalide'),
  locked: z.boolean({ required_error: 'Indiquez verrouiller ou déverrouiller', invalid_type_error: 'Valeur invalide' }),
})

export const classeParams = z.object({ id: objectId('Classe') })
export const createMatiereBody = z.object({
  name: text('Nom de la matière', { max: 60 }),
  coef: coefField.default(1),
  teacher: objectId('Enseignant').nullable().optional(),
})
export const updateMatiereBody = z.object({
  name: text('Nom de la matière', { max: 60 }).optional(),
  coef: coefField.optional(),
  teacher: objectId('Enseignant').nullable().optional(),
})
