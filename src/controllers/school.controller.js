import * as school from '../services/school.service.js'

export const get = async (req, res) => res.json(await school.get(req.user))
export const update = async (req, res) => res.json(await school.update(req.user, req.body))
export const setAnnee = async (req, res) => res.json(await school.setAnnee(req.user, req.body))
