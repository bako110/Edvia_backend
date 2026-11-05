import { Router } from 'express'
import * as ctrl from '../controllers/incident.controller.js'
import { authenticate } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { createIncidentBody } from '../validators/incident.validator.js'

const r = Router()
// les droits fins (enseignant de la classe, sa matière…) sont vérifiés dans la couche service / policies
r.post('/eleves/:id/incidents', authenticate, validate({ params: idParams, body: createIncidentBody }), ctrl.create)
r.delete('/incidents/:id', authenticate, validate({ params: idParams }), ctrl.remove)
export default r
