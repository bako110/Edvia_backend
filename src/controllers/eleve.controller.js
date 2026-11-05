import * as eleves from '../services/eleve.service.js'

export const add = async (req, res) => res.status(201).json(await eleves.add(req.user, req.params.id, req.body))
export const update = async (req, res) => { await eleves.update(req.user, req.params.id, req.body); res.json({ ok: true }) }
export const remove = async (req, res) => { await eleves.remove(req.user, req.params.id); res.json({ ok: true }) }
export const setObs = async (req, res) => { await eleves.setObs(req.user, req.params.id, req.body); res.json({ ok: true }) }
