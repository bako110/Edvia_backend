import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config/env.js'
import api from './routes/index.js'
import { errorHandler } from './middlewares/error.js'
import { rateLimit, envNum } from './utils/rateLimit.js'

export function createApp({ staticDir = config.staticDir } = {}) {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', config.trustProxy)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'], connectSrc: ["'self'", ...config.corsOrigins, ...config.connectSrc],
        objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null,
      },
    },
  }))
  // CORS : adresses listées dans CORS_ORIGIN, et (selon la configuration) toute page ouverte sur localhost
  if (config.corsOrigins.length || config.allowLocalhost) {
    const isLocalhost = o => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o)
    app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || (config.allowLocalhost && isLocalhost(origin))) }))
  }
  app.use(express.json({ limit: '600kb' }))

  // Les réponses de l'API (notes, bulletins, comptes) ne sont jamais conservées en cache par le navigateur ou un intermédiaire
  app.use('/api', (req, res, next) => { res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' }); next() })
  // Limite de débit globale par adresse IP (freine les robots et le moissonnage de données)
  app.use('/api', rateLimit({ max: () => envNum('RATE_LIMIT', 600) }))
  app.use('/api', api)

  // Application web construite (react-app/dist), avec repli SPA
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(staticDir, 'index.html')) : next()))
  }

  app.use(errorHandler)
  return app
}
