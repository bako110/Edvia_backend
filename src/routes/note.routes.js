import { Router } from 'express'
import * as ctrl from '../controllers/note.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { setNoteBody, statusQuery } from '../validators/note.validator.js'

const r = Router()
r.put('/notes', authenticate, authorize('admin', 'teacher'), validate({ body: setNoteBody }), ctrl.set)
r.get('/status', authenticate, validate({ query: statusQuery }), ctrl.status)
export default r
