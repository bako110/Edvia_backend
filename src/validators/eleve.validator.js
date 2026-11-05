import { z } from 'zod'
import { text, optionalText } from './common.js'

// lignes « NOM Prénom » ou « NOM Prénom ; matricule »
export const addElevesBody = z.object({
  names: z.array(z.string().trim().min(1, 'Nom d’élève vide').max(140), { required_error: 'Liste d’élèves obligatoire' })
    .min(1, 'Fournissez au moins un élève').max(400, 'Maximum 400 élèves à la fois (l’import découpe automatiquement)'),
})
export const updateEleveBody = z.object({
  name: text('Nom de l’élève', { max: 100 }).optional(),
  matricule: optionalText('Matricule', 30).optional(),
})
// période : 0..2 trimestres, 3 = année complète
export const obsBody = z.object({
  tr: z.coerce.number().int('Période invalide').min(0, 'Période invalide').max(3, 'Période invalide'),
  text: optionalText('Observation', 300).default(''),
})
