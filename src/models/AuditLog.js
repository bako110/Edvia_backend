import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId, Mixed } = mongoose.Schema.Types

/*
 * Journal d'audit : trace permanente de qui a fait quoi, quand et depuis quelle adresse (notes, pénalités, verrous,
 * paiements, comptes…). Il est en AJOUT SEUL : le code interdit toute modification ou suppression d'une entrée.
 */
const auditSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  annee: { type: String, default: '' },
  at: { type: Date, default: Date.now, index: true },
  by: { type: ObjectId, default: null },
  byName: { type: String, default: '' },
  role: { type: String, default: '' },
  ip: { type: String, default: '' },
  action: { type: String, required: true, index: true },
  classe: { type: ObjectId, default: null, index: true },
  eleve: { type: ObjectId, default: null, index: true },
  detail: { type: Mixed, default: {} },
}, { versionKey: false })

const refuse = () => { throw new Error('Le journal d’audit est en ajout seul : modification et suppression interdites') }
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditSchema.pre(op, refuse)
}
auditSchema.pre('save', function (next) { if (!this.isNew) return next(new Error('Le journal d’audit est en ajout seul')); next() })

export default mongoose.model('AuditLog', auditSchema)
