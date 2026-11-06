import * as messages from '../services/message.service.js'

export const send = async (req, res) => res.status(201).json(await messages.send(req.user, req.body))
export const history = async (req, res) => res.json(await messages.history(req.user))
