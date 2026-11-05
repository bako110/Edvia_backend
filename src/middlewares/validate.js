import { badRequest } from '../utils/errors.js'

// validate({ body, params, query }) : valide la requête avec des schémas zod.
// Les données nettoyées remplacent req.body / req.params ; la query validée est dans req.validQuery.
export const validate = schemas => (req, res, next) => {
  for (const part of ['params', 'body', 'query']) {
    const schema = schemas[part]
    if (!schema) continue
    const r = schema.safeParse(part === 'body' ? (req.body ?? {}) : req[part])
    if (!r.success) throw badRequest(r.error.issues[0]?.message || 'Données invalides')
    if (part === 'query') req.validQuery = r.data
    else req[part] = r.data
  }
  next()
}
