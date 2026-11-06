import { Router } from 'express'
import { z } from 'zod'
import * as seal from '../services/seal.service.js'
import { rateLimit, envNum } from '../utils/rateLimit.js'
import { validate } from '../middlewares/validate.js'

const query = z.object({
  ref: z.string({ required_error: 'Référence obligatoire' }).trim().regex(/^([0-9a-fA-F]{24}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/, 'Référence invalide')
    .transform(v => (v.length === 24 ? v : v.replace('-', '').toUpperCase().replace(/(.{4})(.{4})/, '$1-$2'))),
  p: z.coerce.number().int().min(0).max(3),
  code: z.string().trim().regex(/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/, 'Code invalide').transform(v => v.replace(/-/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3')),
})
const r = Router()
// public (un parent ou un employeur n'a pas de compte) : limité par adresse IP contre les essais en rafale
r.get('/verify', rateLimit({ max: () => envNum('VERIFY_LIMIT', 20), windowMs: 10 * 60_000, message: 'Trop de vérifications. Réessayez dans quelques minutes.' }),
  validate({ query }), async (req, res) => res.json(await seal.verify(req.validQuery)))
export default r
