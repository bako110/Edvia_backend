import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

export const INCIDENT_TYPES = ['retard', 'absence', 'comportement', 'penalite', 'sanction']

/*
 * Vie scolaire : un événement dans la vie d'un élève pendant un trimestre.
 *  retard        minutes (facultatif)
 *  absence       hours + justified
 *  comportement  label (catégorie) + motif obligatoire
 *  penalite      points retirés à la moyenne d'UNE matière (ou à la moyenne générale) + motif obligatoire
 *  sanction      label (avertissement, blâme…) + motif — réservée à l'administration
 * Chaque événement garde l'auteur : le bulletin dit qui a pénalisé et pourquoi.
 */
const incidentSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  classe: { type: ObjectId, ref: 'Classe', required: true, index: true },
  eleve: { type: ObjectId, ref: 'Eleve', required: true },
  tr: { type: Number, required: true, min: 0, max: 2 },
  type: { type: String, enum: INCIDENT_TYPES, required: true },
  date: { type: Date, default: Date.now },
  matiere: { type: ObjectId, default: null },          // matière concernée (pénalité) ; null = moyenne générale
  points: { type: Number, default: 0, min: 0, max: 10 },
  minutes: { type: Number, default: 0, min: 0, max: 600 },
  hours: { type: Number, default: 0, min: 0, max: 100 },
  justified: { type: Boolean, default: false },
  label: { type: String, default: '', trim: true, maxlength: 40 },
  motif: { type: String, default: '', trim: true, maxlength: 200 },
  by: { type: ObjectId, ref: 'User', default: null },
  byName: { type: String, default: '' },               // conservé même si le compte est désactivé
}, { timestamps: true })

incidentSchema.index({ eleve: 1, tr: 1 })

export default mongoose.model('Incident', incidentSchema)
