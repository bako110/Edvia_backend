import { z } from 'zod'
import { objectId, optionalText } from './common.js'

const time = name => z.string({ required_error: `${name} obligatoire` }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${name} invalide (HH:MM)`)
const day = z.coerce.number({ invalid_type_error: 'Jour invalide' }).int('Jour invalide').min(1, 'Jour invalide').max(6, 'Jour invalide')

export const createCreneauBody = z.object({
  matiereId: objectId('Matière'), day, start: time('Heure de début'), end: time('Heure de fin'), room: optionalText('Salle', 30).optional(),
})
export const updateCreneauBody = z.object({
  matiereId: objectId('Matière').optional(), day: day.optional(), start: time('Heure de début').optional(), end: time('Heure de fin').optional(),
  room: optionalText('Salle', 30).optional(),
})
