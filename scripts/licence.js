// Gestion des licences en ligne de commande (propriétaire de la plateforme, accès à la base requis) :
//   npm run licence -- create --days 365 --students 500 --note "Lycée X" [--count 3]
//   npm run licence -- list
//   npm run licence -- revoke EDV-XXXX-XXXX-XXXX-XXXX
//   npm run licence -- restore EDV-XXXX-XXXX-XXXX-XXXX
//   npm run licence -- extend EDV-XXXX-XXXX-XXXX-XXXX 30
import { connectDb, disconnectDb } from '../src/config/db.js'
import * as lic from '../src/services/license.service.js'

const [cmd, ...rest] = process.argv.slice(2)
const opt = name => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : undefined }
const fmt = d => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')
const STATE = { libre: 'libre', active: 'active', expiree: 'EXPIRÉE', annulee: 'ANNULÉE' }

try {
  await connectDb()
  if (cmd === 'create') {
    const days = Number(opt('days') || 365), maxStudents = Number(opt('students') || 0), count = Number(opt('count') || 1), note = opt('note') || ''
    if (!(days >= 1 && days <= 3650)) throw new Error('--days : entre 1 et 3650')
    const made = await lic.ownerCreate({ days, maxStudents, note, count })
    console.log(`\n${made.length} licence(s) créée(s) — ${days} jours${maxStudents ? `, ${maxStudents} élèves max` : ', élèves illimités'}${note ? ` — ${note}` : ''}\n`)
    for (const m of made) console.log('  ' + m.code)
    console.log('\nCe code s\'entre à « Enregistrer mon établissement ». Il ne sert qu\'une fois ; la durée démarre à l\'activation.')
  } else if (cmd === 'list') {
    const list = await lic.ownerList()
    if (!list.length) console.log('Aucune licence.')
    for (const l of list) console.log(`${l.code}  ${STATE[l.state].padEnd(8)} ${String(l.days).padStart(4)} j  ${l.maxStudents ? String(l.maxStudents).padStart(5) + ' él.' : '  illimité'}  ${l.school ? `${l.school.name} (jusqu'au ${fmt(l.expiresAt)})` : '—'}  ${l.note}`)
  } else if (cmd === 'revoke' || cmd === 'restore') {
    const r = await lic.ownerSetStatus(rest[0], cmd === 'revoke' ? 'revoked' : 'active')
    console.log(`${r.code} : ${cmd === 'revoke' ? 'ANNULÉE — l\'établissement est verrouillé tout de suite' : 'rétablie'}`)
  } else if (cmd === 'extend') {
    const days = Number(rest[1])
    if (!(days >= 1)) throw new Error('Usage : extend CODE JOURS')
    const r = await lic.ownerExtend(rest[0], days)
    console.log(`${r.code} : +${days} jours${r.expiresAt ? ` — valable jusqu'au ${fmt(r.expiresAt)}` : ''}`)
  } else {
    console.log('Commandes : create | list | revoke CODE | restore CODE | extend CODE JOURS')
  }
} catch (e) {
  console.error('Erreur :', e.message)
  process.exitCode = 1
} finally {
  await disconnectDb()
}
