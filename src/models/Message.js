import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

export const AUDIENCES = ['ecole', 'classe', 'eleve', 'impayes']
export const CHANNELS = ['sms', 'whatsapp', 'email']

// Historique des communications adressées aux parents (le message est envoyé depuis l'appareil de l'administration)
const messageSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  annee: { type: String, default: '' },
  classe: { type: ObjectId, ref: 'Classe', default: null },
  eleve: { type: ObjectId, ref: 'Eleve', default: null },
  audience: { type: String, enum: AUDIENCES, required: true },
  channel: { type: String, enum: CHANNELS, required: true },
  subject: { type: String, default: '', trim: true, maxlength: 120 },
  body: { type: String, required: true, trim: true, maxlength: 1000 },
  recipients: { type: Number, default: 0 },
  by: { type: ObjectId, ref: 'User', default: null },
  byName: { type: String, default: '' },
}, { timestamps: true })

messageSchema.index({ school: 1, createdAt: -1 })

export default mongoose.model('Message', messageSchema)
