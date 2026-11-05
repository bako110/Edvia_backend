import mongoose from 'mongoose'

// Sortie JSON uniforme pour tous les modèles : `id` au lieu de `_id`, pas de `__v`,
// et jamais de secrets (sel / hash de mot de passe), quelle que soit la requête.
mongoose.plugin(schema => {
  schema.set('toJSON', {
    versionKey: false,
    transform(doc, ret) {
      ret.id = String(ret._id)
      delete ret._id
      delete ret.salt
      delete ret.hash
      return ret
    },
  })
})
