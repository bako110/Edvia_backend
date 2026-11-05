import dns from 'node:dns'
import mongoose from 'mongoose'
import '../models/index.js'
import { config } from './env.js'

export async function connectDb({ uri = config.mongoUri, dbName = config.dbName } = {}) {
  // Certains réseaux (box, fournisseur d'accès) refusent les requêtes DNS « SRV » nécessaires à
  // mongodb+srv:// (erreur « querySrv ECONNREFUSED ») : DNS_SERVERS permet d'imposer des DNS publics.
  if (config.dnsServers.length) dns.setServers(config.dnsServers)
  mongoose.set('strictQuery', true)
  // Atlas (cloud) répond plus lentement qu'une base locale : délai de sélection plus large
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: /^mongodb\+srv:/.test(uri) ? 12000 : 5000 })
  // crée les index déclarés dans les modèles (unicité, performances)
  await Promise.all(Object.values(mongoose.models).map(m => m.init()))
  return mongoose.connection
}
export const disconnectDb = () => mongoose.disconnect()
