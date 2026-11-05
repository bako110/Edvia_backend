import { z } from 'zod'
import { text, optionalText } from './common.js'

export const updateSchoolBody = z.object({
  name: text('Nom de l’établissement').optional(),
  ministere: optionalText('Ministère', 160).optional(),
  devise: optionalText('Devise', 160).optional(),
  annee: text('Année scolaire', { max: 20 }).optional(),
  proviseur: optionalText('Proviseur', 80).optional(),
  slogan: optionalText('Slogan', 120).optional(),
  brand: z.string().regex(/^#[0-9a-f]{6}$/i, 'Couleur invalide').optional(),
  logo: z.string().max(400_000, 'Logo trop volumineux (300 Ko maximum)')
    .regex(/^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)?$/, 'Logo invalide (PNG, JPEG ou WebP)').optional(),
})
