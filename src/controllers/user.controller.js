import * as users from '../services/user.service.js'

export const list = async (req, res) => res.json(await users.list(req.user))
export const create = async (req, res) => res.status(201).json(await users.create(req.user, req.body))
export const update = async (req, res) => { await users.update(req.user, req.params.id, req.body); res.json({ ok: true }) }
export const resetPassword = async (req, res) => { await users.resetPassword(req.user, req.params.id, req.body); res.json({ ok: true }) }
