import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Secret JWT : variable JWT_SECRET (fichier .env). Obligatoire en production ;
// en développement seulement, repli sur un secret généré une fois et gardé dans data/jwt.secret.
function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET est obligatoire en production')
  const dir = path.join(root, 'data'), file = path.join(dir, 'jwt.secret')
  try { return fs.readFileSync(file, 'utf8').trim() } catch { /* à créer */ }
  fs.mkdirSync(dir, { recursive: true })
  const s = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(file, s, { mode: 0o600 })
  return s
}

// Nom de la base écrit dans l'adresse : mongodb+srv://…@cluster0.xxx.mongodb.net/Edvia?options
function uriDatabase(uri) {
  const m = String(uri).match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/)
  try { return m && m[1] ? decodeURIComponent(m[1]) : '' } catch { return '' }
}

const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)

/*
 * Configuration — chargée depuis le fichier .env (voir .env.example).
 * Les valeurs sont relues à chaque accès : les tests peuvent modifier process.env avant de créer l'application.
 */
export const config = {
  get env() { return process.env.NODE_ENV || 'development' },
  get isProd() { return process.env.NODE_ENV === 'production' },
  get port() { return Number(process.env.PORT) || 3001 },
  get mongoUri() { return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017' },
  // DB_NAME s'il est renseigné ; sinon la base indiquée dans MONGODB_URI (…mongodb.net/Edvia?…) ; sinon « edvia »
  get dbName() { return process.env.DB_NAME || uriDatabase(config.mongoUri) || 'edvia' },
  get jwtSecret() { return jwtSecret() },
  get jwtExpires() { return process.env.JWT_EXPIRES || '12h' },
  get corsOrigins() { return list(process.env.CORS_ORIGIN) },
  // Nombre de proxys de confiance devant le serveur (Render, etc.) : nécessaire pour connaître la vraie adresse IP des visiteurs.
  // Par défaut : 1 en production (hébergeur), 0 en local. TRUST_PROXY=0 pour le désactiver.
  get trustProxy() { const v = process.env.TRUST_PROXY; return v === undefined || v === '' ? (this.isProd ? 1 : 0) : /^\d+$/.test(v) ? Number(v) : v },
  get dnsServers() { return list(process.env.DNS_SERVERS) },
  get connectSrc() { return list(process.env.CONNECT_SRC) },
  // Accepte les pages ouvertes sur http://localhost:<n'importe quel port> (Vite choisit un autre port si 5173 est pris).
  // Par défaut : oui en développement, non en production ; CORS_ALLOW_LOCALHOST=true l'active aussi sur un serveur en ligne
  // (utile pour utiliser le serveur en ligne depuis l'application lancée sur votre ordinateur).
  get allowLocalhost() { const v = process.env.CORS_ALLOW_LOCALHOST; return v === undefined || v === '' ? !this.isProd : /^(1|true|oui|yes)$/i.test(v) },
  staticDir: path.join(root, '..', 'react-app', 'dist'),
}

// Contrôle au démarrage : en production, on refuse une configuration dangereuse
export function checkConfig() {
  const problems = []
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) problems.push('PORT invalide')
  if (!/^mongodb(\+srv)?:\/\//.test(config.mongoUri)) problems.push('MONGODB_URI doit commencer par mongodb:// ou mongodb+srv://')
  if (!/^\d+[smhd]?$/.test(config.jwtExpires)) problems.push('JWT_EXPIRES invalide (ex. 12h, 30m, 7d)')
  if (config.isProd) {
    const s = process.env.JWT_SECRET || ''
    if (s.length < 32) problems.push('JWT_SECRET doit faire au moins 32 caractères en production')
    if (!config.corsOrigins.length && !fs.existsSync(path.join(config.staticDir, 'index.html')))
      problems.push('CORS_ORIGIN est vide et l’application web (react-app/dist) est introuvable')
  }
  if (problems.length) throw new Error('Configuration invalide :\n - ' + problems.join('\n - '))
}

// Résumé affichable (jamais de secret ni de mot de passe de base)
export const summary = () => ({
  environnement: config.env, port: config.port, base: config.dbName + (process.env.DB_NAME ? '' : ' (nom pris dans MONGODB_URI)'),
  mongo: config.mongoUri.replace(/\/\/[^@/]*@/, '//***@'),   // masque les identifiants éventuels
  session: config.jwtExpires, cors: config.corsOrigins.length ? config.corsOrigins.join(', ') : '(même origine)',
  dns: config.dnsServers.length ? config.dnsServers.join(', ') : '(système)',
  secretJwt: process.env.JWT_SECRET ? 'défini (.env)' : 'généré en local (data/jwt.secret)',
})
