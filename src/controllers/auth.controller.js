import * as auth from '../services/auth.service.js'

export const register = async (req, res) => res.status(201).json(await auth.register(req.body))
export const login = async (req, res) => res.json(await auth.login(req.ip, req.body))
export const me = async (req, res) => res.json(await auth.me(req.user))
export const changePassword = async (req, res) => res.json(await auth.changePassword(req.user, req.body))
