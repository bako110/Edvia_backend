import { Router } from 'express'
import * as ctrl from '../controllers/eleve.controller.js'
import { authenticate } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { updateEleveBody, obsBody } from '../validators/eleve.validator.js'

const r = Router()
r.use('/eleves', authenticate)
r.put('/eleves/:id', validate({ params: idParams, body: updateEleveBody }), ctrl.update)
r.delete('/eleves/:id', validate({ params: idParams }), ctrl.remove)
r.put('/eleves/:id/obs', validate({ params: idParams, body: obsBody }), ctrl.setObs)
export default r
