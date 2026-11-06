import { Router } from 'express'
import { z } from 'zod'
import * as audit from '../services/audit.service.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { objectId } from '../validators/common.js'

const query = z.object({
  action: z.string().max(40).optional(), classeId: objectId('Classe').optional(), eleveId: objectId('Élève').optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})
const r = Router()
// administrateur : tout ; personnel : seulement les actions sur les notes et les élèves (voir le service) ; aucune route ne modifie ni ne supprime le journal
r.get('/audit', authenticate, authorize('admin', 'staff'), validate({ query }), async (req, res) => res.json(await audit.list(req.user, req.validQuery)))
export default r
