import crypto from 'node:crypto'
import mongoose from 'mongoose'
import './plugins.js'   // masque salt/hash dans toute sortie JSON

export const ROLES = ['admin', 'teacher', 'staff']

const userSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  login: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    match: [/^[a-z0-9][a-z0-9._-]{2,31}$/, 'Identifiant : lettres, chiffres, point, tiret ou underscore (3 à 32 caractères)'],
  },
  name: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 80 },
  role: { type: String, enum: { values: ROLES, message: 'Rôle invalide' }, required: true },
  active: { type: Boolean, default: true },
  mustChange: { type: Boolean, default: false },   // mot de passe provisoire à changer
  tokenVersion: { type: Number, default: 0 },      // incrémenté à chaque changement de mot de passe / rôle / désactivation : les anciens jetons tombent
  // jamais renvoyés ni chargés par défaut
  salt: { type: String, select: false },
  hash: { type: String, select: false },
}, { timestamps: true })

// Mots de passe : scrypt + sel aléatoire, jamais stockés en clair
userSchema.methods.setPassword = function (password) {
  this.salt = crypto.randomBytes(16).toString('hex')
  this.hash = crypto.scryptSync(password, this.salt, 64).toString('hex')
}
userSchema.methods.checkPassword = function (password) {
  if (!this.salt || !this.hash) return false
  const a = crypto.scryptSync(String(password), this.salt, 64), b = Buffer.from(this.hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export default mongoose.model('User', userSchema)
