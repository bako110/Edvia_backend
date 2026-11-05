import { Router } from 'express'
import * as ctrl from '../controllers/auth.controller.js'
import { authenticate } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { registerBody, loginBody, changePasswordBody } from '../validators/auth.validator.js'

const r = Router()
r.post('/auth/register', validate({ body: registerBody }), ctrl.register)
r.post('/auth/login', validate({ body: loginBody }), ctrl.login)
r.get('/me', authenticate, ctrl.me)
r.post('/me/password', authenticate, validate({ body: changePasswordBody }), ctrl.changePassword)
export default r
