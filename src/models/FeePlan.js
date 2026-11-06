import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

export const MODALITES = ['annuel', 'trimestriel', 'mensuel', 'personnalise']
export const METHODS = ['especes', 'mobile_money', 'virement', 'cheque']
export const KINDS = ['inscription', 'scolarite']

/*
 * Plan de frais d'UNE classe : droit d'inscription, scolarité annuelle et modalité de paiement
 * (comptant, par trimestre, par mois ou échéancier personnalisé). Montants en FCFA (entiers).
 * La somme des tranches doit être égale à la scolarité.
 */
const trancheSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 40 },
  amount: { type: Number, required: true, min: 0 },
  due: { type: Date, required: true },
})

const feePlanSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  classe: { type: ObjectId, ref: 'Classe', required: true, unique: true },
  capacity: { type: Number, default: 0, min: 0 },       // effectif maximum (0 = illimité)
  inscription: { type: Number, default: 0, min: 0 },
  scolarite: { type: Number, default: 0, min: 0 },
  modalite: { type: String, enum: MODALITES, default: 'trimestriel' },
  tranches: [trancheSchema],
}, { timestamps: true })

export default mongoose.model('FeePlan', feePlanSchema)
