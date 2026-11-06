import mongoose from 'mongoose'
import './plugins.js'
import { makeRef } from '../utils/ref.js'

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
  ref: { type: String, default: makeRef, unique: true, sparse: true },   // référence publique (bulletin, vérification)
  // Inscription : pending = dossier en attente, enrolled = inscrit(e), withdrawn = retiré(e)
  status: { type: String, enum: ['pending', 'enrolled', 'withdrawn'], default: 'enrolled' },
  enrolledAt: { type: Date, default: Date.now },
  // Parent / tuteur (communication avec les familles)
  parentName: { type: String, default: '', trim: true, maxlength: 100 },
  parentPhone: { type: String, default: '', trim: true, maxlength: 25 },
  parentEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 120 },
  remise: { type: Number, default: 0, min: 0 },        // réduction / bourse sur la scolarité (FCFA)
  notes: { type: Mixed, default: () => ({}) },
  obs: { type: Mixed, default: () => ({}) },
}, { timestamps: true, minimize: false })

eleveSchema.index({ classe: 1, name: 1 }, { unique: true })

export default mongoose.model('Eleve', eleveSchema)
