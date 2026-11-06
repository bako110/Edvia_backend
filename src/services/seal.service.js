import { Classe, Eleve, Incident, School } from '../models/index.js'
import { sealCode, sameCode } from '../utils/seal.js'

/*
 * Vérifie l'authenticité d'un bulletin : on recalcule le sceau d'après les notes ACTUELLES.
 * Réponse volontairement minimale (aucune note, aucune moyenne) et identique pour « inconnu » et « faux ».
 */
export async function verify({ ref, p, code }) {
  const bad = { valid: false }
  const eleve = await Eleve.findOne(/^[0-9a-f]{24}$/i.test(ref) ? { _id: ref } : { ref }).lean()
  if (!eleve) return bad
  const classe = await Classe.findById(eleve.classe)
  if (!classe) return bad
  const incidents = await Incident.find({ eleve: eleve._id, type: 'penalite' }).lean()
  const expected = sealCode({ school: eleve.school, annee: classe.annee, eleve, classe, period: p }, incidents)
  if (!sameCode(code, expected)) return bad
  const school = await School.findById(eleve.school).select('name')
  return { valid: true, ecole: school?.name || '', annee: classe.annee, classe: classe.name, eleve: eleve.name, period: p }
}
