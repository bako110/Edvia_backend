import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

// Une matière appartient à une classe : coefficient + enseignant responsable
const matiereSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Le nom de la matière est obligatoire'], trim: true, maxlength: 60 },
  coef: { type: Number, default: 1, min: [0.5, 'Coefficient : entre 0,5 et 20'], max: [20, 'Coefficient : entre 0,5 et 20'] },
  teacher: { type: ObjectId, ref: 'User', default: null },
})

const classeSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true },
  annee: { type: String, required: true, index: true },   // année scolaire : tout (élèves, notes, frais, horaires) en dépend
  name: { type: String, required: [true, 'Le nom de la classe est obligatoire'], trim: true, maxlength: 30 },
  principal: { type: ObjectId, ref: 'User', default: null },   // professeur principal
  matieres: [matiereSchema],
  // trimestres verrouillés (conseil de classe terminé) : plus aucune note ni pénalité ne peut être modifiée
  locked: { type: [Boolean], default: () => [false, false, false] },
}, { timestamps: true })

classeSchema.index({ school: 1, annee: 1, name: 1 }, { unique: true })
classeSchema.index({ 'matieres.teacher': 1 })

export default mongoose.model('Classe', classeSchema)
