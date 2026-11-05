import { School } from '../models/index.js'

export const get = user => School.findById(user.school)

// Identité de l'établissement : nom, devise, année, couleur, logo…
export const update = (user, data) =>
  School.findByIdAndUpdate(user.school, { $set: data }, { new: true, runValidators: true })
