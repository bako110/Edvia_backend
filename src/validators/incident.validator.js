import { z } from 'zod'
import { objectId, optionalText } from './common.js'

const TYPES = ['retard', 'absence', 'comportement', 'penalite', 'sanction']

export const justifyBody = z.object({ justified: z.boolean({ required_error: 'Indiquez si l’absence est justifiée', invalid_type_error: 'Valeur invalide' }) })

export const createIncidentBody = z.object({
  tr: z.coerce.number({ invalid_type_error: 'Trimestre invalide' }).int('Trimestre invalide').min(0, 'Trimestre invalide').max(2, 'Trimestre invalide'),
  type: z.enum(TYPES, { errorMap: () => ({ message: 'Type d’événement invalide' }) }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date invalide').optional(),
  matiereId: objectId('Matière').nullable().optional(),
  points: z.coerce.number({ invalid_type_error: 'Points invalides' }).min(0.25, 'Pénalité : au moins 0,25 point').max(10, 'Pénalité : 10 points au maximum').optional(),
  minutes: z.coerce.number({ invalid_type_error: 'Durée invalide' }).int('Durée invalide').min(0).max(600, 'Retard : 600 minutes au maximum').optional(),
  hours: z.coerce.number({ invalid_type_error: 'Durée invalide' }).min(0.5, 'Absence : au moins 0,5 heure').max(100).optional(),
  justified: z.boolean().optional(),
  label: optionalText('Catégorie', 40).optional(),
  motif: optionalText('Motif', 200).optional(),
}).superRefine((v, ctx) => {
  const need = (cond, path, message) => { if (!cond) ctx.addIssue({ code: 'custom', path: [path], message }) }
  const motif = (v.motif || '').trim()
  if (v.type === 'penalite') {
    need(v.points !== undefined, 'points', 'Indiquez le nombre de points retirés')
    need(motif.length >= 3, 'motif', 'Le motif de la pénalité est obligatoire')
  }
  if (v.type === 'comportement') need(motif.length >= 3, 'motif', 'Précisez le comportement reproché')
  if (v.type === 'sanction') {
    need(motif.length >= 3, 'motif', 'Le motif de la sanction est obligatoire')
    need((v.label || '').trim().length >= 2, 'label', 'Indiquez la sanction (avertissement, blâme…)')
  }
  if (v.type === 'absence') need(v.hours !== undefined, 'hours', 'Indiquez la durée de l’absence en heures')
})
