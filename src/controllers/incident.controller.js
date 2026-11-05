import * as incidents from '../services/incident.service.js'

export const create = async (req, res) => res.status(201).json(await incidents.create(req.user, req.params.id, req.body))
export const remove = async (req, res) => { await incidents.remove(req.user, req.params.id); res.json({ ok: true }) }
