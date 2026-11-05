import * as classes from '../services/classe.service.js'

const ok = res => res.json({ ok: true })

export const list = async (req, res) => res.json(await classes.list(req.user))
export const create = async (req, res) => res.status(201).json(await classes.create(req.user, req.body))
export const update = async (req, res) => { await classes.update(req.user, req.params.id, req.body); ok(res) }
export const remove = async (req, res) => { await classes.remove(req.user, req.params.id); ok(res) }
export const full = async (req, res) => res.json(await classes.full(req.user, req.params.id))

export const addMatiere = async (req, res) => res.status(201).json(await classes.addMatiere(req.user, req.params.id, req.body))
export const updateMatiere = async (req, res) => { await classes.updateMatiere(req.user, req.params.id, req.params.mid, req.body); ok(res) }
export const removeMatiere = async (req, res) => { await classes.removeMatiere(req.user, req.params.id, req.params.mid); ok(res) }
