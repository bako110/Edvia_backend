import { z } from 'zod'
import { objectId, optionalText } from './common.js'
import { MODALITES, METHODS, KINDS } from '../models/FeePlan.js'

const money = (name, min = 0) => z.coerce.number({ invalid_type_error: `${name} invalide` })
  .int(`${name} : un nombre entier (FCFA)`).min(min, min ? `${name} : au moins ${min} FCFA` : `${name} invalide`).max(100_000_000, `${name} trop élevé`)
const dateField = name => z.string({ required_error: `${name} obligatoire` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${name} invalide`)

export const classeIdParams = z.object({ id: objectId('Classe') })

export const planBody = z.object({
  capacity: money('Effectif maximum').default(0),
  inscription: money('Droit d’inscription').default(0),
  scolarite: money('Scolarité').default(0),
  modalite: z.enum(MODALITES, { errorMap: () => ({ message: 'Modalité de paiement invalide' }) }),
  tranches: z.array(z.object({
    label: z.string().trim().min(1, 'Nom d’échéance obligatoire').max(40),
    amount: money('Montant de l’échéance'),
    due: dateField('Date d’échéance'),
  })).max(12, '12 échéances au maximum').optional(),
})

export const paiementBody = z.object({
  kind: z.enum(KINDS, { errorMap: () => ({ message: 'Type de versement invalide' }) }),
  amount: money('Montant', 1),
  method: z.enum(METHODS, { errorMap: () => ({ message: 'Moyen de paiement invalide' }) }).default('especes'),
  reference: optionalText('Référence', 60).optional(),
  date: dateField('Date').optional(),
})
