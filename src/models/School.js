import mongoose from 'mongoose'
import './plugins.js'
import { currentSchoolYear } from '../utils/year.js'

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Le nom de l’établissement est obligatoire'], trim: true, maxlength: 120 },
  ministere: { type: String, default: 'MINISTÈRE DE L’ÉDUCATION', trim: true, maxlength: 160 },
  devise: { type: String, default: 'La Patrie ou la Mort, nous vaincrons', trim: true, maxlength: 160 },
  annee: { type: String, default: () => currentSchoolYear(), trim: true, maxlength: 20 },   // année affichée à tout le monde (choisie par l'administrateur)
  annees: { type: [String], default: undefined },                            // toutes les années existantes
  proviseur: { type: String, default: '', trim: true, maxlength: 80 },
  slogan: { type: String, default: '', trim: true, maxlength: 120 },
  // identité visuelle propre à chaque établissement
  brand: { type: String, default: '#0b2a5e', lowercase: true, match: [/^#[0-9a-f]{6}$/i, 'Couleur invalide'] },
  logo: {
    type: String, default: '', maxlength: 400_000,
    validate: { validator: v => v === '' || DATA_URL.test(v), message: 'Logo invalide (PNG, JPEG ou WebP)' },
  },
}, { timestamps: true })

export default mongoose.model('School', schoolSchema)
