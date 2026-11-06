import * as tt from '../services/timetable.service.js'

export const forClasse = async (req, res) => res.json(await tt.forClasse(req.user, req.params.id))
export const all = async (req, res) => res.json(await tt.all(req.user))
export const mine = async (req, res) => res.json(await tt.mine(req.user))
export const create = async (req, res) => res.status(201).json(await tt.create(req.user, req.params.id, req.body))
export const update = async (req, res) => res.json(await tt.update(req.user, req.params.id, req.body))
export const remove = async (req, res) => { await tt.remove(req.user, req.params.id); res.json({ ok: true }) }
