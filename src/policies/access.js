/*
 * Règles d'accès métier (un seul endroit, faciles à tester)
 *  - admin  : tout
 *  - staff  : personnel administratif — lit tout, enregistre les élèves, observations ; ne saisit pas de notes
 *  - teacher: voit ses classes et leurs élèves (lecture seule) ; saisit les notes de SES matières ;
 *             professeur principal d'une classe => consultation complète (moyennes, bulletins)
 */
const same = (a, b) => a != null && b != null && String(a) === String(b)

export const teachesIn = (user, classe) => classe.matieres.some(m => same(m.teacher, user.id))
export const isPrincipal = (user, classe) => same(classe.principal, user.id)

// 'full' = lecture complète · 'teacher' = ses matières seulement · null = aucun accès
export function classAccess(user, classe) {
  if (user.role === 'admin' || user.role === 'staff') return 'full'
  if (isPrincipal(user, classe)) return 'full'
  return teachesIn(user, classe) ? 'teacher' : null
}
// Les élèves sont enregistrés (saisie, import Excel/PDF), corrigés et supprimés par l'ADMINISTRATION uniquement.
// Les enseignants les trouvent déjà chargés dans leur classe : ils ne font que la saisie des notes de leur matière.
export const canManageEleves = user => user.role === 'admin' || user.role === 'staff'
// Vie scolaire (retards, absences, comportement, pénalités) :
//  - administration / personnel : tout, y compris les sanctions et les pénalités sur la moyenne générale
//  - enseignant de la classe : retards, absences, comportement ; pénalité UNIQUEMENT dans sa propre matière
//  - un enseignant ne prononce pas de sanction
export function incidentRefusal(user, classe, type, matiere) {
  if (user.role === 'admin' || user.role === 'staff') return null
  if (user.role !== 'teacher' || !teachesIn(user, classe)) return 'Vous n’enseignez pas dans cette classe'
  if (type === 'sanction') return 'Les sanctions sont réservées à l’administration'
  if (type === 'penalite' && !(matiere && same(matiere.teacher, user.id))) return 'Vous ne pouvez pénaliser que dans votre propre matière'
  return null
}
export const canDeleteIncident = (user, incident) => user.role === 'admin' || user.role === 'staff' || same(incident.by, user.id)
export const canWriteObs = (user, classe) => user.role === 'admin' || user.role === 'staff' || isPrincipal(user, classe)
export const canEnterNote = (user, matiere) => user.role === 'admin' || (user.role === 'teacher' && same(matiere.teacher, user.id))
