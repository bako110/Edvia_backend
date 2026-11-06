import express, { Router } from 'express'
import * as devoirs from '../services/devoir.service.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { idParams } from '../validators/common.js'
import { createDevoirBody } from '../validators/devoir.validator.js'

const r = Router()
const teacher = authorize('teacher')
r.get('/devoirs', authenticate, async (req, res) => res.json(await devoirs.list(req.user)))
r.post('/devoirs', authenticate, teacher, validate({ body: createDevoirBody }), async (req, res) => res.status(201).json(await devoirs.create(req.user, req.body)))
// le texte chiffré arrive tel quel (octets), jamais interprété par le serveur
r.put('/devoirs/:id/fichier', authenticate, teacher, validate({ params: idParams }), express.raw({ type: () => true, limit: '9.5mb' }),
  async (req, res) => { await devoirs.upload(req.user, req.params.id, req.body); res.json({ ok: true }) })
r.get('/devoirs/:id/fichier', authenticate, validate({ params: idParams }),
  async (req, res) => res.type('application/octet-stream').send(await devoirs.download(req.user, req.params.id)))
r.delete('/devoirs/:id', authenticate, validate({ params: idParams }), async (req, res) => { await devoirs.remove(req.user, req.params.id); res.json({ ok: true }) })
export default r
