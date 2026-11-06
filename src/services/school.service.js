import { audit } from './audit.service.js'
import { Classe, FeePlan, School } from '../models/index.js'
import { notFound } from '../utils/errors.js'

export const get = user => School.findById(user.school)

// Identité de l'établissement : nom, devise, année, couleur, logo…
export async function update(user, data) {
  await audit(user, 'identite', { detail: { champs: Object.keys(data) } })
  return School.findByIdAndUpdate(user.school, { $set: data }, { new: true, runValidators: true })
}

/*
 * Année scolaire : l'administrateur choisit l'année affichée à tout le monde. Toutes les données (classes, élèves,
 * notes, frais, horaires, messages) sont rattachées à une année : changer d'année remplace donc tout le contenu.
 * Une nouvelle année peut reprendre la structure d'une autre (classes, matières, enseignants, frais) sans les élèves.
 */
const shiftYear = (date, by) => { const d = new Date(date); d.setUTCFullYear(d.getUTCFullYear() + by); return d }

export async function setAnnee(user, { annee, create, copyFrom }) {
  const school = await School.findById(user.school)
  const known = school.annees?.length ? school.annees : [school.annee]
  if (!known.includes(annee)) {
    if (!create) throw notFound('Cette année scolaire n’existe pas encore')
    known.push(annee)
    if (copyFrom) {
      if (!known.includes(copyFrom)) throw notFound('Année à copier introuvable')
      const delta = parseInt(annee, 10) - parseInt(copyFrom, 10)
      for (const c of await Classe.find({ school: school._id, annee: copyFrom })) {
        const copy = await Classe.create({
          school: school._id, annee, name: c.name, principal: c.principal,
          matieres: c.matieres.map(m => ({ name: m.name, coef: m.coef, teacher: m.teacher })),
        })
        const plan = await FeePlan.findOne({ classe: c._id }).lean()
        if (plan) await FeePlan.create({
          school: school._id, classe: copy._id, capacity: plan.capacity, inscription: plan.inscription, scolarite: plan.scolarite,
          modalite: plan.modalite, tranches: plan.tranches.map(t => ({ label: t.label, amount: t.amount, due: shiftYear(t.due, delta) })),
        })
      }
    }
  }
  await audit(user, 'annee', { detail: { de: school.annee, a: annee, creation: !!create, copie: copyFrom || null } })
  school.annees = [...new Set(known)].sort()
  school.annee = annee
  await school.save()
  return school
}
