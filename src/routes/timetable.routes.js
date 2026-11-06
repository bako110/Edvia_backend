import { Router } from 'express'
import * as ctrl from '../controllers/timetable.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { createCreneauBody, updateCreneauBody } from '../validators/timetable.validator.js'

const r = Router()
const admin = authorize('admin')
r.get('/emploi-du-temps/mon', authenticate, authorize('teacher'), ctrl.mine)
r.get('/emploi-du-temps', authenticate, authorize('admin', 'staff'), ctrl.all)
r.get('/classes/:id/emploi-du-temps', authenticate, validate({ params: idParams }), ctrl.forClasse)
r.post('/classes/:id/creneaux', authenticate, admin, validate({ params: idParams, body: createCreneauBody }), ctrl.create)
r.put('/creneaux/:id', authenticate, admin, validate({ params: idParams, body: updateCreneauBody }), ctrl.update)
r.delete('/creneaux/:id', authenticate, admin, validate({ params: idParams }), ctrl.remove)
export default r
