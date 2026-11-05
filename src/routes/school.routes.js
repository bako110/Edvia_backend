import { Router } from 'express'
import * as ctrl from '../controllers/school.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { updateSchoolBody } from '../validators/school.validator.js'

const r = Router()
r.use('/school', authenticate)
r.get('/school', ctrl.get)
r.put('/school', authorize('admin'), validate({ body: updateSchoolBody }), ctrl.update)
export default r
