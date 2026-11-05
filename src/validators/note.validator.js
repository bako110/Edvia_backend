import { z } from 'zod'
import { objectId } from './common.js'

const tr = z.coerce.number({ invalid_type_error: 'Trimestre invalide' }).int('Trimestre invalide').min(0, 'Trimestre invalide').max(2, 'Trimestre invalide')

// Note sur 20 ; la virgule est acceptée ; '' efface la note
const noteValue = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim().replace(',', '.')
  if (s === '') return ''
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 20) { ctx.addIssue({ code: 'custom', message: 'La note doit être comprise entre 0 et 20' }); return z.NEVER }
  return String(Math.round(n * 100) / 100)
})

export const setNoteBody = z.object({
  eleveId: objectId('Élève'),
  matiereId: objectId('Matière'),
  tr,
  k: z.coerce.number({ invalid_type_error: 'Colonne invalide' }).int().min(0, 'Colonne invalide').max(2, 'Colonne invalide'),   // 0 = devoir 1, 1 = devoir 2, 2 = composition
  value: noteValue,
})
export const statusQuery = z.object({ tr: tr.default(0) })
