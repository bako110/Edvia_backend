import dns from 'node:dns'
import mongoose from 'mongoose'
import '../models/index.js'
import { config } from './env.js'
import { makeRef } from '../utils/ref.js'

export async function connectDb({ uri = config.mongoUri, dbName = config.dbName } = {}) {
  // Certains réseaux (box, fournisseur d'accès) refusent les requêtes DNS « SRV » nécessaires à
  // mongodb+srv:// (erreur « querySrv ECONNREFUSED ») : DNS_SERVERS permet d'imposer des DNS publics.
  if (config.dnsServers.length) dns.setServers(config.dnsServers)
  mongoose.set('strictQuery', true)
  // Atlas (cloud) répond plus lentement qu'une base locale : délai de sélection plus large
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: /^mongodb\+srv:/.test(uri) ? 12000 : 5000 })
  // crée les index déclarés dans les modèles (unicité, performances)
  await Promise.all(Object.values(mongoose.models).map(m => m.init()))
  await migrate()
  return mongoose.connection
}

// Mise à niveau des données créées avant la gestion des années : tout est rattaché à l'année de l'établissement
async function migrate() {
  const { School, Classe, Message } = mongoose.models
  try { await Classe.collection.dropIndex('school_1_name_1') } catch { /* index déjà supprimé ou absent */ }
  for (const s of await School.find({ $or: [{ annees: { $exists: false } }, { annees: { $size: 0 } }] })) {
    s.annees = [s.annee]; await s.save()
  }
  // référence publique des élèves déjà enregistrés
  const { Eleve } = mongoose.models
  const sans = await Eleve.find({ ref: { $exists: false } }).select('_id').lean()
  for (let i = 0; i < sans.length; i += 500) {
    await Eleve.bulkWrite(sans.slice(i, i + 500).map(e => ({ updateOne: { filter: { _id: e._id }, update: { $set: { ref: makeRef() } } } })))
  }
  for (const s of await School.find().select('annee')) {
    await Classe.updateMany({ school: s._id, annee: { $exists: false } }, { $set: { annee: s.annee } })
    await Message.updateMany({ school: s._id, annee: { $in: ['', null] } }, { $set: { annee: s.annee } })
  }
}
export const disconnectDb = () => mongoose.disconnect()
