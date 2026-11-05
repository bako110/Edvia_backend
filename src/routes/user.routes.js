import { Router } from 'express'
import * as ctrl from '../controllers/user.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { createUserBody, updateUserBody, resetPasswordBody } from '../validators/user.validator.js'

const r = Router()
r.use('/users', authenticate)
r.get('/users', authorize('admin', 'staff'), ctrl.list)
r.post('/users', authorize('admin'), validate({ body: createUserBody }), ctrl.create)
r.put('/users/:id', authorize('admin'), validate({ params: idParams, body: updateUserBody }), ctrl.update)
r.put('/users/:id/password', authorize('admin'), validate({ params: idParams, body: resetPasswordBody }), ctrl.resetPassword)
export default r
