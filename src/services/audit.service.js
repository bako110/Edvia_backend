import { AuditLog, Classe, Eleve } from '../models/index.js'

// Enregistre une action. Volontairement SANS try/catch : si la trace ne peut pas être écrite, l'action est refusée.
export async function audit(user, action, { classe = null, eleve = null, detail = {} } = {}) {
  await AuditLog.create({
    school: user.school, annee: user.annee || '', by: user._id, byName: user.name, role: user.role, ip: user.ip || '',
    action, classe, eleve, detail,
  })
}

// Actions visibles par le personnel administratif (rien sur les comptes, les paiements, l'identité ni les connexions)
export const STAFF_ACTIONS = ['note', 'verrou', 'deverrou', 'penalite', 'sanction', 'incident_supprime', 'absence_justifiee', 'observation', 'eleve_modifie', 'eleve_supprime']

// Consultation : les 300 dernières entrées, filtrables. Le personnel voit un journal restreint, sans adresses IP.
export async function list(user, { action, classeId, eleveId, limit = 300 }) {
  const staff = user.role !== 'admin'
  if (staff && action && !STAFF_ACTIONS.includes(action)) return []
  const filter = { school: user.school, ...(staff && !action ? { action: { $in: STAFF_ACTIONS } } : {}), ...(action ? { action } : {}), ...(classeId ? { classe: classeId } : {}), ...(eleveId ? { eleve: eleveId } : {}) }
  const rows = await AuditLog.find(filter).sort('-at').limit(Math.min(limit, 500)).lean()
  const [classes, eleves] = await Promise.all([
    Classe.find({ _id: { $in: rows.map(r => r.classe).filter(Boolean) } }).select('name annee'),
    Eleve.find({ _id: { $in: rows.map(r => r.eleve).filter(Boolean) } }).select('name'),
  ])
  const cn = new Map(classes.map(c => [c.id, c.name])), en = new Map(eleves.map(e => [e.id, e.name]))
  return rows.map(r => ({
    id: String(r._id), at: r.at, action: r.action, byName: r.byName, role: r.role, ip: staff ? '' : r.ip, annee: r.annee,
    classe: r.classe ? cn.get(String(r.classe)) || '(supprimée)' : null, eleve: r.eleve ? en.get(String(r.eleve)) || '(supprimé)' : null,
    detail: r.detail,
  }))
}
