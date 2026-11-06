import { z } from 'zod'
import { text, optionalText } from './common.js'

// Enregistrement en lot : lignes « NOM Prénom ; matricule ; sexe ; naissance ; lieu ; parent ; téléphone » et/ou fiches complètes
const loose = z.string({ invalid_type_error: 'Valeur invalide' }).max(300, 'Valeur trop longue').optional()
const record = z.object({
  name: z.string({ required_error: 'Nom d’élève vide' }).trim().min(1, 'Nom d’élève vide').max(140),
  matricule: loose, sex: loose, birthDate: loose, birthPlace: loose, nationality: loose, address: loose, previousSchool: loose,
  repeater: z.union([z.boolean(), z.string().max(20)]).optional(), parentName: loose, parentPhone: loose, parentPhone2: loose, parentEmail: loose, parentRelation: loose,
})
export const addElevesBody = z.object({
  names: z.array(z.string().trim().min(1, 'Nom d’élève vide').max(600)).max(400, 'Maximum 400 élèves à la fois (l’import découpe automatiquement)').optional(),
  students: z.array(record).max(400, 'Maximum 400 élèves à la fois (l’import découpe automatiquement)').optional(),
}).refine(v => (v.names?.length || 0) + (v.students?.length || 0) > 0, 'Fournissez au moins un élève')
  .refine(v => (v.names?.length || 0) + (v.students?.length || 0) <= 400, 'Maximum 400 élèves à la fois (l’import découpe automatiquement)')
const STATUS = z.enum(['pending', 'enrolled', 'withdrawn'], { errorMap: () => ({ message: 'Statut d’inscription invalide' }) })
const phone = z.string({ invalid_type_error: 'Téléphone invalide' }).trim().max(25, 'Téléphone trop long').regex(/^[0-9+ ().-]*$/, 'Téléphone invalide : chiffres uniquement')
const digits = v => v.replace(/\D/g, '').length
const contact = phone.refine(v => digits(v) >= 8, 'Numéro à contacter obligatoire (8 chiffres au moins)')
const email = z.string({ invalid_type_error: 'E-mail invalide' }).trim().max(120).refine(v => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Adresse e-mail invalide')
const remise = z.coerce.number({ invalid_type_error: 'Remise invalide' }).int('Remise : un nombre entier (FCFA)').min(0, 'Remise invalide').max(100_000_000)

// fiche d'identité (tous facultatifs)
const phone2 = phone.refine(v => v === '' || digits(v) >= 8, 'Second numéro : 8 chiffres au moins')
const extra = {
  sex: z.enum(['M', 'F', ''], { errorMap: () => ({ message: 'Sexe invalide' }) }).optional(),
  birthDate: z.string({ invalid_type_error: 'Date de naissance invalide' }).regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date de naissance invalide')
    .refine(v => v === '' || (!isNaN(Date.parse(v)) && new Date(v) <= new Date() && new Date(v).getFullYear() > 1980), 'Date de naissance invalide').optional(),
  birthPlace: optionalText('Lieu de naissance', 80).optional(),
  nationality: optionalText('Nationalité', 40).optional(),
  address: optionalText('Adresse', 160).optional(),
  previousSchool: optionalText('Ancien établissement', 100).optional(),
  repeater: z.boolean({ invalid_type_error: 'Valeur invalide' }).optional(),
  health: optionalText('Santé / remarques', 200).optional(),
  parentRelation: z.enum(['pere', 'mere', 'tuteur', 'autre', ''], { errorMap: () => ({ message: 'Lien de parenté invalide' }) }).optional(),
  parentPhone2: phone2.optional(),
}

export const updateEleveBody = z.object({
  ...extra,
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
  ...extra,
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
