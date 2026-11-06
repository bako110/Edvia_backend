import { z } from 'zod'
import { objectId, optionalText, text } from './common.js'
import { AUDIENCES, CHANNELS } from '../models/Message.js'

export const sendMessageBody = z.object({
  audience: z.enum(AUDIENCES, { errorMap: () => ({ message: 'Destinataires invalides' }) }),
  classeId: objectId('Classe').nullable().optional(),
  eleveId: objectId('Élève').nullable().optional(),
  channel: z.enum(CHANNELS, { errorMap: () => ({ message: 'Canal invalide' }) }),
  subject: optionalText('Objet', 120).optional(),
  body: text('Message', { max: 1000 }),
})
