import { Router } from 'express'
import * as ctrl from '../controllers/finance.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { planBody, paiementBody, classeIdParams } from '../validators/finance.validator.js'

const r = Router()
const office = authorize('admin', 'staff'), admin = authorize('admin')

// Frais de scolarité : administration et personnel administratif (les enseignants n'y ont pas accès)
r.get('/finance', authenticate, office, ctrl.overview)
r.get('/classes/:id/finance', authenticate, office, validate({ params: classeIdParams }), ctrl.classFinance)
r.put('/classes/:id/finance', authenticate, admin, validate({ params: classeIdParams, body: planBody }), ctrl.setPlan)
r.post('/eleves/:id/paiements', authenticate, office, validate({ params: idParams, body: paiementBody }), ctrl.addPaiement)
r.delete('/paiements/:id', authenticate, admin, validate({ params: idParams }), ctrl.removePaiement)
export default r
