import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

// Un cours dans l'emploi du temps d'une classe. day : 1 = lundi … 6 = samedi ; start / end : minutes depuis minuit.
const creneauSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  classe: { type: ObjectId, ref: 'Classe', required: true, index: true },
  matiere: { type: ObjectId, required: true },     // _id de la matière dans Classe.matieres
  day: { type: Number, required: true, min: 1, max: 6 },
  start: { type: Number, required: true, min: 0, max: 1439 },
  end: { type: Number, required: true, min: 1, max: 1440 },
  room: { type: String, default: '', trim: true, maxlength: 30 },
}, { timestamps: true })

export default mongoose.model('Creneau', creneauSchema)
