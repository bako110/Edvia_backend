import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

/*
 * Licence : un code remis par le propriétaire de la plateforme (EDVIA) à un établissement.
 *  - sans code valide, aucun établissement ne peut être créé ;
 *  - la durée (days) démarre à l'activation ; à l'expiration la plateforme se verrouille jusqu'au renouvellement ;
 *  - un code ne sert qu'UNE fois (il est lié à l'établissement qui l'active) ;
 *  - maxStudents limite le nombre d'élèves (0 = illimité).
 */
const licenseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  days: { type: Number, required: true, min: 1, max: 3650 },
  maxStudents: { type: Number, default: 0, min: 0, max: 1_000_000 },
  note: { type: String, default: '', trim: true, maxlength: 120 },        // pour qui (ex. nom du lycée)
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  school: { type: ObjectId, ref: 'School', default: null },               // établissement qui l'a activée
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { timestamps: true })

export default mongoose.model('License', licenseSchema)
