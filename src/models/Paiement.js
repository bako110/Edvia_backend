import mongoose from 'mongoose'
import './plugins.js'
import { KINDS, METHODS } from './FeePlan.js'

const { ObjectId } = mongoose.Schema.Types

// Un versement reçu pour un élève (reçu numéroté). On ne modifie pas un versement : on l'annule (admin).
const paiementSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  classe: { type: ObjectId, ref: 'Classe', required: true, index: true },
  eleve: { type: ObjectId, ref: 'Eleve', required: true, index: true },
  kind: { type: String, enum: KINDS, required: true },
  amount: { type: Number, required: true, min: 1 },
  method: { type: String, enum: METHODS, default: 'especes' },
  reference: { type: String, default: '', trim: true, maxlength: 60 },   // n° de transaction, de chèque…
  date: { type: Date, default: Date.now },
  receipt: { type: String, default: '' },
  by: { type: ObjectId, ref: 'User', default: null },
  byName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('Paiement', paiementSchema)
