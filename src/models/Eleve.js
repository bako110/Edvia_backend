import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId, Mixed } = mongoose.Schema.Types

/*
 * notes : { [trimestre 0..2]: { [matiereId]: { d1, d2, c, by, at } } }
 * obs   : { [période 0..3]:  "observation du conseil de classe" }
 * Mixed + minimize:false => mises à jour atomiques par champ ($set 'notes.0.<id>.d1'),
 * deux enseignants peuvent donc saisir en même temps sans s'écraser.
 */
const eleveSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  classe: { type: ObjectId, ref: 'Classe', required: true },
  name: { type: String, required: [true, 'Le nom de l’élève est obligatoire'], trim: true, maxlength: 100 },
  matricule: { type: String, default: '', trim: true, maxlength: 30 },
  notes: { type: Mixed, default: () => ({}) },
  obs: { type: Mixed, default: () => ({}) },
}, { timestamps: true, minimize: false })

eleveSchema.index({ classe: 1, name: 1 }, { unique: true })

export default mongoose.model('Eleve', eleveSchema)
