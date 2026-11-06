import { Router } from 'express'
import * as inscriptions from '../services/inscription.service.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { enrollBody } from '../validators/eleve.validator.js'

const r = Router()
r.get('/inscriptions', authenticate, authorize('admin', 'staff'), async (req, res) => res.json(await inscriptions.overview(req.user)))
// les droits fins sont vérifiés dans le service
r.post('/classes/:id/inscriptions', authenticate, validate({ params: idParams, body: enrollBody }),
  async (req, res) => res.status(201).json(await inscriptions.enroll(req.user, req.params.id, req.body)))
export default r
