import { Classe, Eleve, Message, School } from '../models/index.js'
import { badRequest, notFound } from '../utils/errors.js'
import { situations } from './finance.service.js'

// Numéro au format international sans « + » (wa.me) : un numéro burkinabè à 8 chiffres reçoit l'indicatif 226
export function phoneIntl(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  return d.length === 8 ? '226' + d : d
}
const fcfa = n => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA`

// Remplace {parent} {eleve} {classe} {ecole} {solde} dans le texte du message
export function fill(text, vars) {
  return text.replace(/\{(parent|eleve|classe|ecole|solde)\}/g, (_, k) => vars[k] ?? '')
}

// Les élèves visés par un message (retirés exclus)
async function targets(user, { audience, classeId, eleveId }) {
  if (audience === 'eleve') {
    const e = await Eleve.findOne({ _id: eleveId, school: user.school })
    if (!e) throw notFound('Élève introuvable')
    return Classe.find({ _id: e.classe, school: user.school, annee: user.annee }).then(c => ({ classes: c, only: String(e._id) }))
  }
  const filter = { school: user.school, annee: user.annee, ...(classeId ? { _id: classeId } : {}) }
  const classes = await Classe.find(filter).sort('name')
  if (classeId && !classes.length) throw notFound('Classe introuvable')
  return { classes, only: null }
}

/*
 * Prépare un message aux parents : résout les destinataires, personnalise le texte pour chacun et garde une trace.
 * L'envoi lui-même se fait depuis l'appareil de l'administration (SMS, WhatsApp, e-mail) : aucun service payant n'est branché.
 */
export async function send(user, { audience, classeId, eleveId, channel, subject, body }) {
  if (audience === 'classe' && !classeId) throw badRequest('Choisissez une classe')
  if (audience === 'eleve' && !eleveId) throw badRequest('Choisissez un élève')
  const { classes, only } = await targets(user, { audience, classeId: audience === 'impayes' || audience === 'classe' ? classeId : null, eleveId })
  const [school, rows] = await Promise.all([School.findById(user.school).select('name'), situations(user.school, classes)])
  const cname = new Map(classes.map(c => [c.id, c.name]))

  let list = rows.filter(r => r.eleve.status !== 'withdrawn')
  if (only) list = list.filter(r => String(r.eleve._id) === only)
  if (audience === 'impayes') list = list.filter(r => r.state === 'en_retard')

  const recipients = [], missing = []
  for (const r of list) {
    const e = r.eleve
    const reach = channel === 'email' ? (e.parentEmail || '').trim() : phoneIntl(e.parentPhone)
    if (!reach) { missing.push({ eleveId: String(e._id), eleve: e.name, classe: cname.get(String(e.classe)) }); continue }
    const text = fill(body, { parent: e.parentName || 'Parent', eleve: e.name, classe: cname.get(String(e.classe)) || '', ecole: school?.name || '', solde: fcfa(r.balance) })
    recipients.push({
      eleveId: String(e._id), eleve: e.name, classe: cname.get(String(e.classe)), parent: e.parentName || '',
      phone: channel === 'email' ? '' : reach, email: channel === 'email' ? reach : '', text, subject: subject ? fill(subject, { eleve: e.name, classe: cname.get(String(e.classe)) || '', ecole: school?.name || '', parent: e.parentName || 'Parent', solde: fcfa(r.balance) }) : '',
    })
  }
  if (!recipients.length && !missing.length) throw badRequest(audience === 'impayes' ? 'Aucun parent à relancer : aucun retard de paiement' : 'Aucun destinataire')

  const saved = await Message.create({
    school: user.school, annee: user.annee, classe: classeId || null, eleve: eleveId || null, audience, channel,
    subject: subject || '', body, recipients: recipients.length, by: user._id, byName: user.name,
  })
  return { id: saved.id, recipients, missing }
}

export async function history(user) {
  const [list, classes] = await Promise.all([
    Message.find({ school: user.school, annee: user.annee }).sort('-createdAt').limit(40).lean(),
    Classe.find({ school: user.school, annee: user.annee }).select('name'),
  ])
  const cname = new Map(classes.map(c => [c.id, c.name]))
  return list.map(m => ({
    id: String(m._id), audience: m.audience, channel: m.channel, subject: m.subject, body: m.body, recipients: m.recipients,
    classe: m.classe ? cname.get(String(m.classe)) || null : null, byName: m.byName, at: m.createdAt,
  }))
}
