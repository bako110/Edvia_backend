import { Router } from 'express'
import * as ctrl from '../controllers/school.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { updateSchoolBody, anneeBody } from '../validators/school.validator.js'

const r = Router()
r.use('/school', authenticate)
r.get('/school', ctrl.get)
r.put('/school', authorize('admin'), validate({ body: updateSchoolBody }), ctrl.update)
r.put('/school/annee', authorize('admin'), validate({ body: anneeBody }), ctrl.setAnnee)
export default r
