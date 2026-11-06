import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import * as lic from '../services/license.service.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { rateLimit, envNum } from '../utils/rateLimit.js'
import { makeLimiter } from '../utils/loginLimiter.js'
import { HttpError, unauthorized } from '../utils/errors.js'

const r = Router()

/* ---------- public : vérification d'un code avant la création de l'établissement (étape 1) ---------- */
r.post('/licence/verifier',
  rateLimit({ max: () => envNum('CHECK_LIMIT', 20), windowMs: 10 * 60_000, message: 'Trop d’essais. Réessayez dans quelques minutes.' }),
  validate({ body: z.object({ code: z.string({ required_error: 'Code de licence obligatoire' }).trim().min(6, 'Code de licence obligatoire').max(40, 'Code de licence invalide') }) }),
  async (req, res) => res.json(await lic.check(req.body.code)))

/* ---------- établissement : état de la licence et renouvellement (accessibles même licence expirée) ---------- */
r.get('/licence', authenticate, async (req, res) => res.json(await lic.status(req.user)))
r.post('/licence/renew', authenticate, authorize('admin'),
  rateLimit({ max: 10, windowMs: 10 * 60_000, message: 'Trop d’essais. Réessayez dans quelques minutes.' }),
  validate({ body: z.object({ code: z.string({ required_error: 'Code de licence obligatoire' }).trim().min(6, 'Code de licence obligatoire').max(40) }) }),
  async (req, res) => res.json(await lic.renew(req.user, req.body)))

/* ---------- propriétaire de la plateforme : clé secrète OWNER_KEY (variable d'environnement) ---------- */
const failures = makeLimiter(8, 10 * 60_000)
function ownerOnly(req, res, next) {
  const key = process.env.OWNER_KEY || ''
  if (key.length < 24) throw new HttpError(404, 'Route introuvable')           // pas de clé configurée : l'interface propriétaire n'existe pas
  failures.check(req.ip)
  const given = Buffer.from(String(req.headers['x-owner-key'] || '')), good = Buffer.from(key)
  if (given.length !== good.length || !crypto.timingSafeEqual(given, good)) { failures.fail(req.ip); throw unauthorized('Clé propriétaire incorrecte') }
  failures.reset(req.ip)
  next()
}
const days = z.coerce.number({ invalid_type_error: 'Durée invalide' }).int('Durée invalide').min(1, 'Au moins 1 jour').max(3650, '10 ans au maximum')
r.use('/owner', ownerOnly)
r.get('/owner/licences', async (req, res) => res.json(await lic.ownerList()))
r.post('/owner/licences', validate({ body: z.object({
  days, maxStudents: z.coerce.number().int().min(0).max(1_000_000).default(0),
  note: z.string().trim().max(120).default(''), count: z.coerce.number().int().min(1).max(50).default(1),
}) }), async (req, res) => res.status(201).json(await lic.ownerCreate(req.body)))
r.post('/owner/licences/:code/revoke', async (req, res) => res.json(await lic.ownerSetStatus(req.params.code, 'revoked')))
r.post('/owner/licences/:code/restore', async (req, res) => res.json(await lic.ownerSetStatus(req.params.code, 'active')))
r.post('/owner/licences/:code/extend', validate({ body: z.object({ days }) }), async (req, res) => res.json(await lic.ownerExtend(req.params.code, req.body.days)))
export default r
