import * as notes from '../services/note.service.js'

export const set = async (req, res) => res.json(await notes.set(req.user, req.body))
export const status = async (req, res) => res.json(await notes.status(req.user, req.validQuery.tr))
