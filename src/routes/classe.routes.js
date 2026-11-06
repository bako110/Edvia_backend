import { Router } from 'express'
import * as ctrl from '../controllers/classe.controller.js'
import * as eleves from '../controllers/eleve.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import {
  createClasseBody, updateClasseBody, classeParams, matiereParams, createMatiereBody, updateMatiereBody, lockBody,
} from '../validators/classe.validator.js'
import { addElevesBody } from '../validators/eleve.validator.js'

const r = Router()
const admin = authorize('admin')
r.use('/classes', authenticate)

r.get('/classes', ctrl.list)
r.post('/classes', admin, validate({ body: createClasseBody }), ctrl.create)
r.put('/classes/:id', admin, validate({ params: classeParams, body: updateClasseBody }), ctrl.update)
r.delete('/classes/:id', admin, validate({ params: classeParams }), ctrl.remove)
r.put('/classes/:id/lock', authorize('admin', 'staff'), validate({ params: classeParams, body: lockBody }), ctrl.setLock)
r.get('/classes/:id/full', validate({ params: classeParams }), ctrl.full)

r.post('/classes/:id/matieres', admin, validate({ params: classeParams, body: createMatiereBody }), ctrl.addMatiere)
r.put('/classes/:id/matieres/:mid', admin, validate({ params: matiereParams, body: updateMatiereBody }), ctrl.updateMatiere)
r.delete('/classes/:id/matieres/:mid', admin, validate({ params: matiereParams }), ctrl.removeMatiere)

// les droits fins (enseignant de la classe, etc.) sont vérifiés dans la couche service
r.post('/classes/:id/eleves', validate({ params: classeParams, body: addElevesBody }), eleves.add)
export default r
