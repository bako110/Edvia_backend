import { Router } from 'express'
import auth from './auth.routes.js'
import school from './school.routes.js'
import users from './user.routes.js'
import classes from './classe.routes.js'
import eleves from './eleve.routes.js'
import notes from './note.routes.js'
import incidents from './incident.routes.js'
import { notFoundApi } from '../middlewares/error.js'

// Toutes les routes de l'API (montées sous /api)
const api = Router()
api.use(auth, school, users, classes, eleves, notes, incidents)
// Contrôle de santé (hébergeur) : répond 200 sans authentification
api.get('/health', (req, res) => res.json({ ok: true }))
api.use(notFoundApi)
export default api
