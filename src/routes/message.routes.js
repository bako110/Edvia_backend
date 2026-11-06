import { Router } from 'express'
import * as ctrl from '../controllers/message.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { sendMessageBody } from '../validators/message.validator.js'

const r = Router()
r.use('/messages', authenticate, authorize('admin', 'staff'))
r.get('/messages', ctrl.history)
r.post('/messages', validate({ body: sendMessageBody }), ctrl.send)
export default r
