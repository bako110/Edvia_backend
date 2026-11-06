import * as finance from '../services/finance.service.js'

export const overview = async (req, res) => res.json(await finance.overview(req.user))
export const classFinance = async (req, res) => res.json(await finance.classFinance(req.user, req.params.id))
export const setPlan = async (req, res) => res.json(await finance.setPlan(req.user, req.params.id, req.body))
export const addPaiement = async (req, res) => res.status(201).json(await finance.addPaiement(req.user, req.params.id, req.body))
export const removePaiement = async (req, res) => { await finance.removePaiement(req.user, req.params.id); res.json({ ok: true }) }
