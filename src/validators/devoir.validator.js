import { z } from 'zod'
import { objectId, optionalText, text } from './common.js'

const b64 = (name, min, max) => z.string({ required_error: `${name} obligatoire` }).regex(/^[A-Za-z0-9+/]+={0,2}$/, `${name} invalide`).min(min, `${name} invalide`).max(max, `${name} invalide`)

export const createDevoirBody = z.object({
  classeId: objectId('Classe'),
  matiereId: objectId('Matière'),
  title: text('Titre du devoir', { max: 120 }),
  note: optionalText('Remarque', 300).optional(),
  size: z.coerce.number().int().min(0).max(9 * 1024 * 1024),
  salt: b64('Sel', 16, 64), iv: b64('Vecteur', 12, 32),
  iter: z.coerce.number().int().min(100_000, 'Dérivation de clé trop faible').max(2_000_000),
})
