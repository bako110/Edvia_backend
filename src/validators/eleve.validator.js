import { z } from 'zod'
import { text, optionalText } from './common.js'

// lignes « NOM Prénom » ou « NOM Prénom ; matricule »
export const addElevesBody = z.object({
  names: z.array(z.string().trim().min(1, 'Nom d’élève vide').max(140), { required_error: 'Liste d’élèves obligatoire' })
    .min(1, 'Fournissez au moins un élève').max(400, 'Maximum 400 élèves à la fois (l’import découpe automatiquement)'),
})
const STATUS = z.enum(['pending', 'enrolled', 'withdrawn'], { errorMap: () => ({ message: 'Statut d’inscription invalide' }) })
const phone = z.string({ invalid_type_error: 'Téléphone invalide' }).trim().max(25, 'Téléphone trop long').regex(/^[0-9+ ().-]*$/, 'Téléphone invalide : chiffres uniquement')
const digits = v => v.replace(/\D/g, '').length
const contact = phone.refine(v => digits(v) >= 8, 'Numéro à contacter obligatoire (8 chiffres au moins)')
const email = z.string({ invalid_type_error: 'E-mail invalide' }).trim().max(120).refine(v => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Adresse e-mail invalide')
const remise = z.coerce.number({ invalid_type_error: 'Remise invalide' }).int('Remise : un nombre entier (FCFA)').min(0, 'Remise invalide').max(100_000_000)

export const updateEleveBody = z.object({
  name: text('Nom de l’élève', { max: 100 }).optional(),
  matricule: optionalText('Matricule', 30).optional(),
  status: STATUS.optional(),
  parentName: optionalText('Nom du parent', 100).optional(),
  parentPhone: phone.refine(v => v === '' || digits(v) >= 8, 'Numéro à contacter : 8 chiffres au moins').optional(),
  parentEmail: email.optional(),
  remise: remise.optional(),
})

// inscription d'un élève avec son dossier (parent, remise, droit d'inscription déjà versé)
export const enrollBody = z.object({
  name: text('Nom de l’élève', { max: 100 }),
  matricule: optionalText('Matricule', 30).optional(),
  status: STATUS.optional(),
  parentName: optionalText('Nom du parent', 100).optional(),
  parentPhone: contact,   // obligatoire : c'est ce numéro qu'on appelle en cas de besoin
  parentEmail: email.optional(),
  remise: remise.optional(),
  paiement: z.object({
    amount: z.coerce.number().int('Montant : un nombre entier (FCFA)').min(1, 'Montant invalide').max(100_000_000),
    method: z.enum(['especes', 'mobile_money', 'virement', 'cheque']).optional(),
    reference: optionalText('Référence', 60).optional(),
  }).optional(),
})
// période : 0..2 trimestres, 3 = année complète
export const obsBody = z.object({
  tr: z.coerce.number().int('Période invalide').min(0, 'Période invalide').max(3, 'Période invalide'),
  text: optionalText('Observation', 300).default(''),
})
