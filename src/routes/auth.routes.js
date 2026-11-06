import { Router } from 'express'
import { rateLimit, envNum } from '../utils/rateLimit.js'
import * as ctrl from '../controllers/auth.controller.js'
import { authenticate } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { registerBody, loginBody, changePasswordBody } from '../validators/auth.validator.js'

const r = Router()
// création d'établissement : limitée par adresse IP (anti-robots)
r.post('/auth/register', rateLimit({ max: () => envNum('REGISTER_LIMIT', 10), windowMs: 60 * 60_000, message: 'Trop de créations d’établissement depuis cette adresse. Réessayez plus tard.' }), validate({ body: registerBody }), ctrl.register)
r.post('/auth/login', validate({ body: loginBody }), ctrl.login)
r.get('/me', authenticate, ctrl.me)
r.post('/me/password', authenticate, validate({ body: changePasswordBody }), ctrl.changePassword)
export default r
