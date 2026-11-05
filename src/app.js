import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config/env.js'
import api from './routes/index.js'
import { errorHandler } from './middlewares/error.js'

export function createApp({ staticDir = config.staticDir } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'], connectSrc: ["'self'", ...config.corsOrigins],
        objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null,
      },
    },
  }))
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }))   // app servie depuis un autre domaine
  app.use(express.json({ limit: '600kb' }))

  app.use('/api', api)

  // Application web construite (react-app/dist), avec repli SPA
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(staticDir, 'index.html')) : next()))
  }

  app.use(errorHandler)
  return app
}
