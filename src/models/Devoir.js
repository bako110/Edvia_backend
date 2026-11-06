import mongoose from 'mongoose'
import './plugins.js'

const { ObjectId } = mongoose.Schema.Types

/*
 * Dépôt chiffré d'un devoir. Le fichier est chiffré DANS LE NAVIGATEUR du professeur (AES-256-GCM, clé dérivée de
 * son mot de passe par PBKDF2) : le serveur ne reçoit et ne garde que du texte chiffré, il n'a jamais le mot de passe.
 * Le nom et le type du fichier sont chiffrés avec lui. Seule une personne à qui le professeur communique le mot de passe
 * peut ouvrir le fichier.
 */
const devoirSchema = new mongoose.Schema({
  school: { type: ObjectId, ref: 'School', required: true, index: true },
  annee: { type: String, required: true },
  classe: { type: ObjectId, ref: 'Classe', required: true, index: true },
  matiere: { type: ObjectId, required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  note: { type: String, default: '', trim: true, maxlength: 300 },
  size: { type: Number, default: 0 },                    // taille du fichier d'origine (octets)
  salt: { type: String, required: true },
  iv: { type: String, required: true },
  iter: { type: Number, required: true },
  data: { type: Buffer, select: false },                 // texte chiffré, jamais chargé par défaut
  sealed: { type: Boolean, default: false },             // vrai quand le fichier chiffré est bien reçu
  by: { type: ObjectId, ref: 'User', required: true },
  byName: { type: String, default: '' },
}, { timestamps: true })

devoirSchema.index({ school: 1, annee: 1, createdAt: -1 })

export default mongoose.model('Devoir', devoirSchema)
