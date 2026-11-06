import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// Les tests n'utilisent JAMAIS la base du fichier .env (Atlas, production…) : base locale dédiée,
// ou celle de MONGODB_TEST_URI si elle est définie. Chaque exécution crée une base temporaire puis la supprime.
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017'
process.env.JWT_SECRET = 'test-secret'
process.env.OWNER_KEY = 'cle-proprietaire-de-test-0123456789'
process.env.RATE_LIMIT = '100000'
process.env.REGISTER_LIMIT = '1000'   // les tests font des milliers d'appels depuis la même adresse
process.env.DB_NAME = 'edvia_test_' + Date.now()
const { connectDb, disconnectDb } = await import('../src/config/db.js')
const { createApp } = await import('../src/app.js')
const { generateCode } = await import('../src/services/license.service.js')
// licence de test : créée directement en base, comme le ferait le propriétaire de la plateforme
const lic = async (o = {}) => (await mongoose.models.License.create({ code: generateCode(), days: 365, ...o })).code

let server, base
before(async () => {
  await connectDb()
  server = createApp({ staticDir: null }).listen(0)
  base = `http://127.0.0.1:${server.address().port}/api`
})
after(async () => {
  server.close()
  await mongoose.connection.dropDatabase()
  await disconnectDb()
})

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const ok = async (...a) => { const r = await call(...a); assert.ok(r.status < 300, `${a[0]} ${a[1]} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body }
const S = {}   // état partagé entre les étapes

test('inscription de l’établissement et connexion', async () => {
  assert.equal((await call('POST', '/auth/register', { body: { school: 'Lycée A', name: 'Dir', login: 'adm.a', password: 'court' } })).status, 400)
  const reg = await ok('POST', '/auth/register', { body: { school: 'Lycée A', name: 'Directeur', login: 'adm.a', password: 'motdepasse1', license: await lic() } })
  assert.equal(reg.user.role, 'admin'); assert.equal(reg.school.name, 'Lycée A')
  assert.equal(reg.user.hash, undefined, 'le hash ne sort jamais')
  assert.equal((await call('POST', '/auth/register', { body: { school: 'X', name: 'Y', login: 'ADM.A', password: 'motdepasse1', license: await lic() } })).status, 409, 'identifiant unique sans tenir compte de la casse')
  S.admin = reg.token
  assert.equal((await call('POST', '/auth/login', { body: { login: 'adm.a', password: 'faux' } })).status, 401)
  assert.ok((await ok('POST', '/auth/login', { body: { login: 'ADM.A', password: 'motdepasse1' } })).token)
  assert.equal((await call('GET', '/me')).status, 401)
  assert.equal((await call('GET', '/me', { token: 'n.importe.quoi' })).status, 401)
})

test('l’administrateur crée enseignants et personnel', async () => {
  const mk = (login, name, role) => ok('POST', '/users', { token: S.admin, body: { login, name, role, password: 'provisoire1' } })
  const t1 = await mk('kabore', 'M. Kaboré', 'teacher'), t2 = await mk('ouedraogo', 'Mme Ouédraogo', 'teacher')
  const t3 = await mk('sans.classe', 'Sans classe', 'teacher'), st = await mk('secretaire', 'Secrétariat', 'staff')
  Object.assign(S, { t1id: t1.id, t2id: t2.id, t3id: t3.id, staffId: st.id })
  const login = l => ok('POST', '/auth/login', { body: { login: l, password: 'provisoire1' } })
  const l1 = await login('kabore'); assert.equal(l1.user.mustChange, true)
  S.t1 = l1.token; S.t2 = (await login('ouedraogo')).token; S.t3 = (await login('sans.classe')).token; S.staff = (await login('secretaire')).token
  assert.equal((await call('POST', '/users', { token: S.t1, body: { login: 'x.y.z', name: 'X', role: 'teacher', password: 'provisoire1' } })).status, 403, 'un enseignant ne crée pas de compte')
  assert.equal((await call('POST', '/users', { token: S.admin, body: { login: 'kabore', name: 'Dup', role: 'teacher', password: 'provisoire1' } })).status, 409)
  assert.equal((await call('POST', '/users', { token: S.admin, body: { login: 'bad login!', name: 'X', role: 'teacher', password: 'provisoire1' } })).status, 400)
  assert.equal((await call('POST', '/users', { token: S.admin, body: { login: 'role.ko', name: 'X', role: 'root', password: 'provisoire1' } })).status, 400)
  assert.equal((await call('GET', '/users', { token: S.t1 })).status, 403)
  assert.equal((await ok('GET', '/users', { token: S.staff })).length, 5, 'le personnel peut lister l’équipe')
  // changement du mot de passe provisoire
  assert.equal((await call('POST', '/me/password', { token: S.t1, body: { old: 'mauvais', password: 'nouveaumdp1' } })).status, 400)
  const chg = await ok('POST', '/me/password', { token: S.t1, body: { old: 'provisoire1', password: 'nouveaumdp1' } })
  assert.equal((await call('GET', '/me', { token: S.t1 })).status, 401, 'l’ancien jeton est révoqué par le changement de mot de passe')
  S.t1 = chg.token
  assert.equal((await call('GET', '/me', { token: S.t1 })).status, 200, 'le jeton neuf fonctionne')
  assert.equal((await ok('POST', '/auth/login', { body: { login: 'kabore', password: 'nouveaumdp1' } })).user.mustChange, false)
  // réinitialisation par l'administrateur
  await ok('PUT', `/users/${S.t3id}/password`, { token: S.admin, body: { password: 'autremdp123' } })
  const relog = await ok('POST', '/auth/login', { body: { login: 'sans.classe', password: 'autremdp123' } })
  assert.equal(relog.user.mustChange, true)
  assert.equal((await call('GET', '/me', { token: S.t3 })).status, 401, 'réinitialisation : les sessions ouvertes tombent')
  S.t3 = relog.token
})

test('classe, matières et affectation des professeurs', async () => {
  const { id } = await ok('POST', '/classes', { token: S.admin, body: { name: '6è' } })
  S.cl = id
  assert.equal((await call('POST', '/classes', { token: S.admin, body: { name: '6è' } })).status, 409)
  const full = await ok('GET', `/classes/${id}/full`, { token: S.admin })
  assert.equal(full.matieres.length, 6)
  S.maths = full.matieres.find(m => m.name === 'Mathématiques').id
  S.fr = full.matieres.find(m => m.name === 'Français').id
  await ok('PUT', `/classes/${id}/matieres/${S.maths}`, { token: S.admin, body: { teacher: S.t1id } })
  await ok('PUT', `/classes/${id}/matieres/${S.fr}`, { token: S.admin, body: { teacher: S.t2id } })
  await ok('PUT', `/classes/${id}`, { token: S.admin, body: { principal: S.t2id } })
  assert.equal((await call('PUT', `/classes/${id}`, { token: S.admin, body: { principal: S.staffId } })).status, 400, 'le principal est un enseignant')
  assert.equal((await call('PUT', `/classes/${id}/matieres/${S.maths}`, { token: S.admin, body: { coef: 99 } })).status, 400)
  assert.equal((await call('PUT', `/classes/${id}/matieres/${S.maths}`, { token: S.t1, body: { coef: 9 } })).status, 403)
  const list = await ok('GET', '/classes', { token: S.admin })
  assert.equal(list[0].principal.name, 'Mme Ouédraogo'); assert.equal(list[0].nbMatieres, 6)
  assert.equal((await ok('GET', '/classes', { token: S.t1 })).length, 1)
  assert.equal((await ok('GET', '/classes', { token: S.t3 })).length, 0)
  assert.equal((await call('GET', `/classes/${id}/full`, { token: S.t3 })).status, 403)
  assert.equal((await call('GET', '/classes/pas-un-id/full', { token: S.admin })).status, 400)
})

test('l’administration enregistre les élèves ; les enseignants les trouvent déjà chargés', async () => {
  const r = await ok('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: { names: ['SAWADOGO Awa', 'ZONGO Ibrahim ; M123', 'KABORE Fati', 'SAWADOGO Awa'] } })
  assert.deepEqual(r, { added: 3, skipped: 1 })
  // le personnel administratif peut aussi enregistrer
  assert.deepEqual(await ok('POST', `/classes/${S.cl}/eleves`, { token: S.staff, body: { names: ['DIALLO Seydou'] } }), { added: 1, skipped: 0 })
  // fiches complètes (import Excel / CSV / PDF) et lignes collées étendues ; ce qui est illisible devient vide sans bloquer l'import
  const lot = await ok('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: {
    students: [
      { name: 'LOT Un', matricule: 'L1', sex: 'Fille', birthDate: '14/05/2012', birthPlace: 'Bobo-Dioulasso', parentName: 'M. Lot', parentPhone: '70 11 22 33', repeater: 'oui', parentRelation: 'pere' },
      { name: 'LOT Deux', sex: '?', birthDate: '31/02/2012', parentPhone: 'abc<script>', parentEmail: 'pas-un-mail' },
      { name: 'LOT Un' },
    ],
    names: ['LOT Trois ; L3 ; M ; 2011-09-01 ; Koudougou ; Mme Lot ; 76 00 00 00'] } })
  assert.deepEqual(lot, { added: 3, skipped: 1 })
  const lots = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves
  const l1 = lots.find(e => e.name === 'LOT Un'), l2 = lots.find(e => e.name === 'LOT Deux'), l3 = lots.find(e => e.name === 'LOT Trois')
  assert.deepEqual([l1.sex, l1.birthDate, l1.birthPlace, l1.parentPhone, l1.repeater, l1.parentRelation], ['F', '2012-05-14', 'Bobo-Dioulasso', '70 11 22 33', true, 'pere'])
  assert.deepEqual([l2.sex, l2.birthDate, l2.parentPhone, l2.parentEmail], ['', '', '', ''], 'valeurs illisibles : vides, sans erreur')
  assert.deepEqual([l3.sex, l3.birthDate, l3.birthPlace, l3.parentName, l3.parentPhone, l3.matricule], ['M', '2011-09-01', 'Koudougou', 'Mme Lot', '76 00 00 00', 'L3'])
  assert.equal((await call('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: {} })).status, 400)
  for (const x of lots.filter(e => e.name.startsWith('LOT '))) await ok('DELETE', `/eleves/${x.id}`, { token: S.admin })
  // les enseignants ne peuvent ni ajouter, ni modifier, ni supprimer — même dans leur propre classe
  for (const t of [S.t1, S.t2, S.t3]) assert.equal((await call('POST', `/classes/${S.cl}/eleves`, { token: t, body: { names: ['X Y'] } })).status, 403)
  const el = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves
  S.e1 = el.find(e => e.name === 'SAWADOGO Awa').id; S.e2 = el.find(e => e.name.startsWith('ZONGO')).id
  assert.equal(el.find(e => e.name.startsWith('ZONGO')).matricule, 'M123')
  assert.equal((await call('PUT', `/eleves/${S.e2}`, { token: S.t2, body: { name: 'Pirate' } })).status, 403)
  assert.equal((await call('DELETE', `/eleves/${S.e2}`, { token: S.t1 })).status, 403)
  await ok('PUT', `/eleves/${S.e2}`, { token: S.admin, body: { name: 'ZONGO Ibrahim', matricule: 'M124' } })
  assert.equal((await call('PUT', `/eleves/${S.e2}`, { token: S.admin, body: { name: 'KABORE Fati' } })).status, 409)
  // dès leur arrivée, les enseignants de la classe voient la liste chargée
  const mine = await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })
  assert.equal(mine.eleves.length, 4); assert.deepEqual(mine.eleves.map(e => e.name).sort(), ['DIALLO Seydou', 'KABORE Fati', 'SAWADOGO Awa', 'ZONGO Ibrahim'])
  // import volumineux : 300 élèves d'un coup
  const many = Array.from({ length: 300 }, (_, i) => `ELEVE${String(i).padStart(3, '0')} Test`)
  assert.deepEqual(await ok('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: { names: many } }), { added: 300, skipped: 0 })
  assert.deepEqual(await ok('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: { names: many } }), { added: 0, skipped: 300 }, 'réimport = aucun doublon')
  assert.equal((await call('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: { names: Array(401).fill('A B') } })).status, 400)
  const cleanup = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.filter(e => e.name.startsWith('ELEVE') || e.name === 'DIALLO Seydou')
  for (const e of cleanup) await ok('DELETE', `/eleves/${e.id}`, { token: S.admin })
})

test('chaque professeur ne saisit que sa matière', async () => {
  const put = (token, eleveId, matiereId, k, value, tr = 0) => call('PUT', '/notes', { token, body: { eleveId, matiereId, tr, k, value } })
  assert.equal((await put(S.t1, S.e1, S.maths, 0, '14')).body.value, '14')
  assert.equal((await put(S.t1, S.e1, S.maths, 1, '12,5')).body.value, '12.5', 'virgule acceptée')
  assert.equal((await put(S.t1, S.e1, S.fr, 0, '10')).status, 403, 'pas la matière d’un collègue')
  assert.equal((await put(S.t2, S.e1, S.maths, 0, '10')).status, 403)
  assert.equal((await put(S.staff, S.e1, S.maths, 0, '10')).status, 403, 'le personnel ne saisit pas de notes')
  assert.equal((await put(S.t1, S.e1, S.maths, 2, '21')).status, 400)
  assert.equal((await put(S.t1, S.e1, S.maths, 2, 'abc')).status, 400)
  assert.equal((await put(S.t1, S.e1, S.maths, 5, '10')).status, 400)
  assert.equal((await put(S.t1, S.e1, S.maths, 0, '10', 3)).status, 400)
  assert.equal((await put(S.t2, S.e1, S.fr, 2, '9.75')).status, 200)
  assert.equal((await put(S.admin, S.e2, S.fr, 0, '8')).status, 200, 'l’admin peut corriger')
  // écrasement et effacement
  await put(S.t1, S.e1, S.maths, 0, '15'); assert.equal((await put(S.t1, S.e1, S.maths, 1, '')).body.value, '')
})

test('un enseignant est limité à SA classe et SA matière (cas : maths en Terminale)', async () => {
  // M. Kaboré enseigne les maths en 6è ; il n'enseigne rien en Tle C
  const tle = (await ok('POST', '/classes', { token: S.admin, body: { name: 'Tle C' } })).id
  const tf = await ok('GET', `/classes/${tle}/full`, { token: S.admin })
  const mathsTle = tf.matieres.find(m => m.name === 'Mathématiques').id
  await ok('POST', `/classes/${tle}/eleves`, { token: S.admin, body: { names: ['DIALLO Seydou'] } })
  const eTle = (await ok('GET', `/classes/${tle}/full`, { token: S.admin })).eleves[0].id
  const put = (token, eleveId, matiereId) => call('PUT', '/notes', { token, body: { eleveId, matiereId, tr: 0, k: 0, value: '12' } })
  assert.equal((await put(S.t1, eTle, mathsTle)).status, 403, 'même matière mais autre classe : refusé')
  assert.equal((await call('GET', `/classes/${tle}/full`, { token: S.t1 })).status, 403, 'autre classe invisible')
  assert.equal((await call('POST', `/classes/${tle}/eleves`, { token: S.t1, body: { names: ['X Y'] } })).status, 403)
  assert.equal((await call('PUT', `/eleves/${eTle}`, { token: S.t1, body: { name: 'Pirate' } })).status, 403)
  assert.equal((await call('POST', `/classes/${tle}/matieres`, { token: S.t1, body: { name: 'Nouvelle' } })).status, 403, 'seul l’admin crée matières et classes')
  assert.equal((await call('POST', '/classes', { token: S.t1, body: { name: 'Pirate' } })).status, 403)
  // même dans sa propre classe, il ne peut pas enregistrer d'élève
  assert.equal((await call('POST', `/classes/${S.cl}/eleves`, { token: S.t1, body: { names: ['TEMP Eleve'] } })).status, 403)
  await ok('DELETE', `/classes/${tle}`, { token: S.admin })
})

test('un enseignant ne voit que ses matières, le principal voit tout', async () => {
  const mine = await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })
  assert.deepEqual(mine.matieres.map(m => m.name), ['Mathématiques'])
  assert.equal(mine.classe.access, 'teacher')
  const e1 = mine.eleves.find(e => e.id === S.e1)
  assert.deepEqual(e1.notes[0][S.maths], ['15', '', ''])
  assert.equal(e1.notes[0][S.fr], undefined, 'notes des autres matières masquées')
  const principal = await ok('GET', `/classes/${S.cl}/full`, { token: S.t2 })
  assert.equal(principal.classe.access, 'full'); assert.equal(principal.matieres.length, 6)
  assert.deepEqual(principal.eleves.find(e => e.id === S.e1).notes[0][S.fr], ['', '', '9.75'])
})

test('suivi : qui n’a pas renseigné ses notes', async () => {
  const rows = await ok('GET', '/status?tr=0', { token: S.admin })
  const row = id => rows.find(r => r.matiereId === id)
  assert.equal(row(S.maths).total, 3); assert.equal(row(S.maths).filled, 1); assert.equal(row(S.maths).teacherName, 'M. Kaboré')
  assert.equal(row(S.fr).filled, 2)
  assert.equal(rows.filter(r => !r.teacherId).length, 4, 'matières sans enseignant repérées')
  assert.deepEqual((await ok('GET', '/status?tr=0', { token: S.t1 })).map(r => r.matiereName), ['Mathématiques'])
  assert.equal((await ok('GET', '/status?tr=1', { token: S.admin })).every(r => r.filled === 0), true)
  assert.equal((await call('GET', '/status?tr=9', { token: S.admin })).status, 400)
})

test('observations du conseil de classe', async () => {
  assert.equal((await call('PUT', `/eleves/${S.e1}/obs`, { token: S.t1, body: { tr: 0, text: 'Bien' } })).status, 403)
  await ok('PUT', `/eleves/${S.e1}/obs`, { token: S.t2, body: { tr: 0, text: 'Bon travail' } })
  const full = await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })
  assert.equal(full.eleves.find(e => e.id === S.e1).obs[0], 'Bon travail')
  const mine = await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })
  assert.deepEqual(mine.eleves.find(e => e.id === S.e1).obs, {}, 'non visible pour un simple enseignant')
})

test('établissement : identité visuelle réservée à l’administrateur', async () => {
  const upd = await ok('PUT', '/school', { token: S.admin, body: { name: 'Lycée Provincial A', brand: '#1D4ED8', slogan: 'Excellence' } })
  assert.equal(upd.brand, '#1d4ed8'); assert.equal(upd.slogan, 'Excellence')
  assert.equal((await call('PUT', '/school', { token: S.admin, body: { brand: 'rouge' } })).status, 400)
  assert.equal((await call('PUT', '/school', { token: S.admin, body: { logo: 'http://evil/x.png' } })).status, 400)
  const png = 'data:image/png;base64,iVBORw0KGgo='
  assert.equal((await ok('PUT', '/school', { token: S.admin, body: { logo: png } })).logo, png)
  assert.equal((await call('PUT', '/school', { token: S.t1, body: { name: 'Pirate' } })).status, 403)
  assert.equal((await ok('GET', '/school', { token: S.t1 })).name, 'Lycée Provincial A', 'visible par toute l’équipe')
})

test('vie scolaire : retards, comportement, pénalités avec motif — droits par profil', async () => {
  const post = (token, body, eleve = S.e1) => call('POST', `/eleves/${eleve}/incidents`, { token, body })
  // retard et absence : tout enseignant de la classe
  const r1 = await post(S.t1, { tr: 0, type: 'retard', minutes: 15, motif: 'Arrivé à 8h15' })
  assert.equal(r1.status, 201); assert.equal(r1.body.minutes, 15); assert.equal(r1.body.byName, 'M. Kaboré')
  assert.equal((await post(S.t1, { tr: 0, type: 'absence', hours: 2, justified: true })).status, 201)
  // comportement : motif obligatoire
  assert.equal((await post(S.t1, { tr: 0, type: 'comportement', label: 'Bavardage' })).status, 400, 'motif obligatoire')
  assert.equal((await post(S.t1, { tr: 0, type: 'comportement', label: 'Bavardage', motif: 'Perturbe le cours à répétition' })).status, 201)
  // pénalité : seulement dans SA matière, avec points et motif
  const mathsId = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).matieres.find(m => m.name === 'Mathématiques')?.id
  // (la matière « Mathématiques » a été supprimée plus loin : on utilise le Français pour t2, et on recrée des maths pour t1)
  const frId = S.fr
  assert.equal((await post(S.t2, { tr: 0, type: 'penalite', matiereId: frId, points: 1.5 })).status, 400, 'motif obligatoire pour une pénalité')
  assert.equal((await post(S.t2, { tr: 0, type: 'penalite', matiereId: frId, motif: 'Fraude' })).status, 400, 'points obligatoires')
  assert.equal((await post(S.t2, { tr: 0, type: 'penalite', matiereId: frId, points: 11, motif: 'Fraude' })).status, 400, '10 points maximum')
  const pen = await post(S.t2, { tr: 0, type: 'penalite', matiereId: frId, points: 1.5, motif: 'Copie sur son voisin pendant le devoir' })
  assert.equal(pen.status, 201); assert.equal(pen.body.points, 1.5); assert.equal(pen.body.matiereId, frId)
  assert.equal((await post(S.t1, { tr: 0, type: 'penalite', matiereId: frId, points: 1, motif: 'Autre matière' })).status, 403, 'pas dans la matière d’un collègue')
  assert.equal((await post(S.t2, { tr: 0, type: 'penalite', points: 1, motif: 'Sur la moyenne générale' })).status, 403, 'la moyenne générale est réservée à l’administration')
  assert.equal((await post(S.t2, { tr: 0, type: 'sanction', label: 'Blâme', motif: 'Violence' })).status, 403, 'pas de sanction par un enseignant')
  assert.equal((await post(S.t3, { tr: 0, type: 'retard', minutes: 5 })).status, 403, 'enseignant étranger à la classe')
  // administration : sanction + pénalité sur la moyenne générale
  assert.equal((await post(S.admin, { tr: 0, type: 'sanction', label: 'Avertissement', motif: 'Insolence envers un professeur' })).status, 201)
  assert.equal((await post(S.admin, { tr: 0, type: 'penalite', points: 0.5, motif: 'Conduite' })).status, 201)
  assert.equal((await post(S.staff, { tr: 0, type: 'retard', minutes: 10 })).status, 201, 'le personnel enregistre les retards')
  // ce que chacun voit
  const adminView = await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })
  const e1 = adminView.eleves.find(e => e.id === S.e1)
  assert.equal(e1.incidents.length, 7)
  assert.equal(adminView.classe.principalName, 'Mme Ouédraogo', 'nom du professeur principal pour le bulletin')
  const t1View = (await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })).eleves.find(e => e.id === S.e1)
  assert.equal(t1View.incidents.length, 3, 'un enseignant ne voit que ses propres signalements')
  assert.ok(t1View.incidents.every(i => i.byName === 'M. Kaboré'))
  const principalView = (await ok('GET', `/classes/${S.cl}/full`, { token: S.t2 })).eleves.find(e => e.id === S.e1)
  assert.equal(principalView.incidents.length, 7, 'le professeur principal voit tout')
  // suppression : auteur ou administration seulement
  assert.equal((await call('DELETE', `/incidents/${pen.body.id}`, { token: S.t1 })).status, 403)
  assert.equal((await call('DELETE', `/incidents/${r1.body.id}`, { token: S.t2 })).status, 403)
  assert.equal((await call('DELETE', `/incidents/${r1.body.id}`, { token: S.t1 })).status, 200)
  assert.equal((await call('DELETE', `/incidents/${pen.body.id}`, { token: S.t2 })).status, 200)
  assert.equal((await call('DELETE', `/incidents/${pen.body.id}`, { token: S.admin })).status, 404)
  // un autre établissement ne voit rien
  const other = await ok('POST', '/auth/register', { body: { school: 'Lycée C', name: 'Dir C', login: 'adm.c', password: 'motdepasse3', license: await lic() } })
  assert.equal((await post(other.token, { tr: 0, type: 'retard', minutes: 5 })).status, 404)
  // la suppression d'un élève emporte ses signalements
  const tmp = (await ok('POST', `/classes/${S.cl}/eleves`, { token: S.admin, body: { names: ['TEMP Vie'] } }))
  const tmpId = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.find(e => e.name === 'TEMP Vie').id
  await post(S.admin, { tr: 0, type: 'retard', minutes: 5 }, tmpId)
  assert.equal(await mongoose.models.Incident.countDocuments({ eleve: tmpId }), 1)
  await ok('DELETE', `/eleves/${tmpId}`, { token: S.admin })
  assert.equal(await mongoose.models.Incident.countDocuments({ eleve: tmpId }), 0)
  void mathsId; void tmp
})

test('CORS : toute page localhost est acceptée en développement, une adresse inconnue est refusée', async () => {
  const pre = origin => fetch(base + '/auth/login', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } })
  for (const o of ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:49999', 'http://127.0.0.1:4173']) {
    assert.equal((await pre(o)).headers.get('access-control-allow-origin'), o, 'accepté : ' + o)
  }
  for (const o of ['https://pirate.example.com', 'http://localhost.evil.com', 'http://evil.com:5173']) {
    assert.equal((await pre(o)).headers.get('access-control-allow-origin'), null, 'refusé : ' + o)
  }
})

test('sécurité : jetons, mots de passe, limites de débit, aucun secret en sortie', async () => {
  // mots de passe : lettre + chiffre, pas de mot de passe courant
  const reg = body => call('POST', '/auth/register', { body })
  assert.equal((await reg({ school: 'X', name: 'Y', login: 'sec.un', password: 'abcdefghij' })).status, 400, 'sans chiffre')
  assert.equal((await reg({ school: 'X', name: 'Y', login: 'sec.deux', password: '1234567890' })).status, 400, 'sans lettre')
  assert.equal((await reg({ school: 'X', name: 'Y', login: 'sec.trois', password: 'Password' })).status, 400)
  assert.equal((await reg({ school: 'X', name: 'Y', login: 'sec.quatre', password: 'password' })).status, 400, 'mot de passe courant')
  // rôle modifié ou compte désactivé : jeton immédiatement inutilisable
  const u = await ok('POST', '/users', { token: S.admin, body: { login: 'tmp.compte', name: 'Temp', role: 'staff', password: 'provisoire9' } })
  const tok = (await ok('POST', '/auth/login', { body: { login: 'tmp.compte', password: 'provisoire9' } })).token
  assert.equal((await call('GET', '/me', { token: tok })).status, 200)
  await ok('PUT', `/users/${u.id}`, { token: S.admin, body: { role: 'teacher' } })
  assert.equal((await call('GET', '/me', { token: tok })).status, 401, 'changement de rôle : session révoquée')
  // jeton falsifié (signature, algorithme « none », autre secret)
  const jwt = (await import('jsonwebtoken')).default
  assert.equal((await call('GET', '/me', { token: jwt.sign({ uid: u.id, tv: 0 }, 'autre-secret') })).status, 401, 'signature invalide')
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ uid: u.id, tv: 1 })).toString('base64url') + '.'
  assert.equal((await call('GET', '/me', { token: none })).status, 401, 'algorithme none refusé')
  assert.equal((await call('GET', '/me', { token: jwt.sign({ uid: S.staffId }, 'test-secret') })).status, 401, 'jeton sans version refusé')
  // aucune sortie ne contient de secret
  for (const path of ['/users', '/me']) assert.doesNotMatch(JSON.stringify((await call('GET', path, { token: S.admin })).body), /"(hash|salt|tokenVersion)"/)
  // en-têtes : pas de cache sur l'API, pas de signature serveur
  const h = await fetch(base + '/me', { headers: { authorization: 'Bearer ' + S.admin } })
  assert.match(h.headers.get('cache-control'), /no-store/); assert.equal(h.headers.get('x-powered-by'), null)
  assert.ok(h.headers.get('x-content-type-options'))
  // limites de débit
  process.env.REGISTER_LIMIT = '0'
  assert.equal((await reg({ school: 'Robot', name: 'R', login: 'robot.un', password: 'motdepasse77' })).status, 429, 'création d’établissements limitée')
  process.env.REGISTER_LIMIT = '1000'
  process.env.RATE_LIMIT = '1'
  assert.equal((await call('GET', '/health')).status, 429, 'limite globale par adresse')
  process.env.RATE_LIMIT = '100000'
  // blocage par compte même depuis d'autres adresses : 25 échecs
  for (let i = 0; i < 25; i++) await call('POST', '/auth/login', { body: { login: 'kabore', password: 'faux' + i } })
  assert.equal((await call('POST', '/auth/login', { body: { login: 'kabore', password: 'nouveaumdp1' } })).status, 429, 'compte verrouillé après trop d’échecs')
})

test('intégrité des notes : verrou de trimestre, journal d’audit inaltérable, sceau des bulletins', async () => {
  const put = (token, value, tr = 0, k = 2) => call('PUT', '/notes', { token, body: { eleveId: S.e1, matiereId: S.maths, tr, k, value } })
  const audit = (q = '') => ok('GET', '/audit' + q, { token: S.admin })

  // --- journal : chaque modification de note garde l'ancienne et la nouvelle valeur, l'auteur et l'adresse
  assert.equal((await call('GET', '/audit', { token: S.t1 })).status, 403, 'journal fermé aux enseignants')
  const vu = await ok('GET', '/audit', { token: S.staff })
  assert.ok(vu.length > 0 && vu.every(a => ['note', 'verrou', 'deverrou', 'penalite', 'sanction', 'incident_supprime', 'absence_justifiee', 'observation', 'eleve_modifie', 'eleve_supprime'].includes(a.action)), 'le personnel ne voit que les actions sur les notes et les élèves')
  assert.ok(vu.every(a => a.ip === ''), 'le personnel ne voit pas les adresses IP')
  assert.deepEqual(await ok('GET', '/audit?action=compte_modifie', { token: S.staff }), [], 'rien sur les comptes pour le personnel')
  assert.ok((await ok('GET', '/audit?action=compte_modifie', { token: S.admin })).length > 0, 'l’administrateur voit tout')
  const before = (await audit('?action=note')).length
  assert.equal((await put(S.t1, '15')).status, 200)
  assert.equal((await put(S.t1, '16')).status, 200)
  assert.equal((await put(S.t1, '16')).status, 200)   // même valeur : rien à tracer
  const entries = await audit('?action=note')
  assert.equal(entries.length, before + 2)
  const last = entries[0]
  assert.deepEqual([last.byName, last.role, last.detail.de, last.detail.a, last.detail.matiere], ['M. Kaboré', 'teacher', '15', '16', 'Mathématiques'])
  assert.equal(last.eleve, 'SAWADOGO Awa'); assert.ok(last.ip)
  // le journal est en ajout seul, même pour le code applicatif
  const { AuditLog } = mongoose.models
  await assert.rejects(() => AuditLog.deleteMany({}), /ajout seul/)
  await assert.rejects(() => AuditLog.updateOne({}, { $set: { byName: 'x' } }), /ajout seul/)
  assert.equal((await call('DELETE', '/audit', { token: S.admin })).status, 404, 'aucune route de suppression')
  assert.equal((await call('PUT', '/audit', { token: S.admin, body: {} })).status, 404)

  // --- sceau d'authenticité d'un bulletin : calculé par le serveur, vérifiable sans compte
  const full = await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })
  const awa = full.eleves.find(e => e.id === S.e1)
  assert.match(awa.seals[0], /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.match(awa.ref, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'référence publique courte, sans identifiant de base')
  assert.notEqual(awa.ref.replace('-', ''), S.e1.slice(0, 8))
  assert.equal((await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })).eleves[0].seals, undefined, 'pas de sceau pour un enseignant simple')
  const verify = (ref, p, code) => call('GET', `/verify?ref=${ref}&p=${p}&code=${code}`)   // sans jeton
  const good = await verify(awa.ref, 0, awa.seals[0])
  assert.deepEqual([good.status, good.body.valid, good.body.eleve, good.body.classe], [200, true, 'SAWADOGO Awa', '6è'])
  assert.deepEqual(Object.keys(good.body).sort(), ['annee', 'classe', 'ecole', 'eleve', 'period', 'valid'], 'aucune note dans la réponse')
  assert.equal((await verify(awa.ref.toLowerCase().replace('-', ''), 0, awa.seals[0].toLowerCase().replace(/-/g, ''))).body.valid, true, 'saisie tolérante (minuscules, sans tirets)')
  assert.equal((await verify(S.e1, 0, awa.seals[0])).body.valid, true, 'ancien format accepté')
  assert.equal((await verify(S.e1, 0, 'AAAA-BBBB-CCCC')).body.valid, false, 'code inventé')
  assert.equal((await verify(awa.ref, 1, awa.seals[0])).body.valid, false, 'le code d’un trimestre ne vaut pas pour un autre')
  const zongo = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.find(e => e.id === S.e2)
  assert.equal((await verify(zongo.ref, 0, awa.seals[0])).body.valid, false, 'le code d’un élève ne vaut pas pour un autre')
  assert.notEqual(zongo.ref, awa.ref)
  assert.equal((await verify('ZZZZ-ZZZZ', 0, awa.seals[0])).body.valid, false, 'référence inconnue : même réponse')
  assert.equal((await verify('0'.repeat(24), 0, awa.seals[0])).body.valid, false)
  assert.equal((await verify('pas-un-id', 0, awa.seals[0])).status, 400)
  // une note retouchée change le sceau : l'ancien bulletin papier n'est plus valable
  await put(S.t1, '18')
  assert.equal((await verify(awa.ref, 0, awa.seals[0])).body.valid, false, 'bulletin périmé après modification d’une note')
  const awa2 = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.find(e => e.id === S.e1)
  assert.equal((await verify(awa.ref, 0, awa2.seals[0])).body.valid, true)
  // limite d'essais (anti-devinette)
  process.env.VERIFY_LIMIT = '3'
  let last429 = 0
  for (let i = 0; i < 6; i++) last429 = (await verify(awa.ref, 0, 'AAAA-BBBB-CCCC')).status
  assert.equal(last429, 429, 'trop d’essais de vérification')
  delete process.env.VERIFY_LIMIT

  // --- verrou de trimestre : plus rien ne bouge, y compris pour l'administrateur, jusqu'au déverrouillage (journalisé)
  assert.equal((await call('PUT', `/classes/${S.cl}/lock`, { token: S.t2, body: { tr: 0, locked: true } })).status, 403, 'un enseignant ne verrouille pas')
  assert.equal((await call('PUT', `/classes/${S.cl}/lock`, { token: S.staff, body: { tr: 0, locked: true } })).status, 200, 'le personnel peut verrouiller')
  assert.equal((await call('PUT', `/classes/${S.cl}/lock`, { token: S.staff, body: { tr: 0, locked: false } })).status, 403, 'mais pas déverrouiller')
  assert.equal((await call('PUT', `/classes/${S.cl}/lock`, { token: S.admin, body: { tr: 5, locked: true } })).status, 400)
  assert.deepEqual((await ok('PUT', `/classes/${S.cl}/lock`, { token: S.admin, body: { tr: 0, locked: true } })).locked, [true, false, false])
  assert.deepEqual((await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).classe.locked, [true, false, false])
  const blocked = await put(S.t1, '2')
  assert.equal(blocked.status, 403); assert.match(blocked.body.error, /verrouillé/)
  assert.equal((await put(S.admin, '2')).status, 403, 'même l’administrateur doit déverrouiller d’abord')
  assert.equal((await put(S.t1, '17', 1)).status, 200, 'les autres trimestres restent ouverts')
  const pen = { tr: 0, type: 'penalite', points: 1, matiereId: S.maths, motif: 'Triche constatée' }
  assert.equal((await call('POST', `/eleves/${S.e1}/incidents`, { token: S.admin, body: pen })).status, 403, 'pénalité (elle change la moyenne) bloquée aussi')
  assert.equal((await call('POST', `/eleves/${S.e1}/incidents`, { token: S.admin, body: { tr: 0, type: 'retard', minutes: 5 } })).status, 201, 'un retard ne change pas la moyenne')
  await ok('PUT', `/classes/${S.cl}/lock`, { token: S.admin, body: { tr: 0, locked: false } })
  assert.equal((await put(S.t1, '12')).status, 200, 'déverrouillé : la saisie reprend')
  const acts = (await audit()).map(a => a.action)
  assert.ok(acts.includes('verrou') && acts.includes('deverrou'), 'verrouillage et déverrouillage tracés')
  const pen2 = await ok('POST', `/eleves/${S.e1}/incidents`, { token: S.admin, body: pen })
  const traced = (await audit('?action=penalite'))[0]
  assert.deepEqual([traced.detail.points, traced.detail.motif, traced.byName], [1, 'Triche constatée', 'Directeur'])
  const nbDel = (await audit('?action=incident_supprime')).length
  await ok('DELETE', `/incidents/${pen2.id}`, { token: S.admin })
  assert.equal((await audit('?action=incident_supprime')).length, nbDel + 1, 'suppression d’une pénalité tracée')
  assert.ok((await audit()).every(a => a.at && a.byName), 'toutes les entrées ont une date et un auteur')
})

test('frais de scolarité : plan par classe, versements, droits par profil', async () => {
  const plan = { capacity: 0, inscription: 10000, scolarite: 90000, modalite: 'trimestriel' }
  assert.equal((await call('PUT', `/classes/${S.cl}/finance`, { token: S.staff, body: plan })).status, 403, 'le plan est fixé par l’administrateur')
  assert.equal((await call('GET', `/classes/${S.cl}/finance`, { token: S.t1 })).status, 403, 'les enseignants n’ont pas accès aux finances')
  assert.equal((await call('PUT', `/classes/${S.cl}/finance`, { token: S.admin, body: { ...plan, tranches: [{ label: 'A', amount: 1000, due: '2026-10-15' }] } })).status, 400, 'somme des échéances ≠ scolarité')
  const saved = await ok('PUT', `/classes/${S.cl}/finance`, { token: S.admin, body: plan })
  assert.deepEqual(saved.tranches.map(t => t.amount), [30000, 30000, 30000], 'échéancier généré selon la modalité')
  assert.equal((await call('PUT', `/classes/${S.cl}/finance`, { token: S.admin, body: { ...plan, modalite: 'annuel', tranches: saved.tranches } })).status, 400, 'paiement annuel = une seule échéance')

  // versements : trop-perçu refusé, reçu numéroté, remise
  const pay = (token, id, body) => call('POST', `/eleves/${id}/paiements`, { token, body })
  assert.equal((await pay(S.t1, S.e1, { kind: 'scolarite', amount: 5000 })).status, 403)
  assert.equal((await pay(S.staff, S.e1, { kind: 'scolarite', amount: 999999 })).status, 400, 'trop-perçu refusé')
  assert.equal((await pay(S.staff, S.e1, { kind: 'scolarite', amount: 12.5 })).status, 400, 'montant entier')
  const p1 = (await pay(S.staff, S.e1, { kind: 'scolarite', amount: 30000, method: 'mobile_money', reference: 'OM123' })).body
  assert.match(p1.receipt, /^R\d{6}-[0-9A-F]{5}$/); assert.equal(p1.byName, 'Secrétariat')
  await ok('POST', `/eleves/${S.e1}/paiements`, { token: S.staff, body: { kind: 'inscription', amount: 10000 } })
  await ok('PUT', `/eleves/${S.e2}`, { token: S.admin, body: { remise: 30000 } })
  const fin = await ok('GET', `/classes/${S.cl}/finance`, { token: S.staff })
  const a = fin.eleves.find(e => e.id === S.e1), z = fin.eleves.find(e => e.id === S.e2)
  assert.deepEqual([a.due, a.paid, a.balance], [100000, 40000, 60000])
  assert.deepEqual([z.due, z.paid, z.balance], [70000, 0, 70000], 'remise déduite de la scolarité')
  assert.equal(a.paiements.length, 2); assert.equal(fin.totals.paid, 40000)
  assert.equal((await ok('GET', '/finance', { token: S.admin })).classes.find(c => c.id === S.cl).paid, 40000)
  assert.equal((await call('DELETE', `/paiements/${p1.id}`, { token: S.staff })).status, 403, 'seul l’administrateur annule un versement')
  await ok('DELETE', `/paiements/${p1.id}`, { token: S.admin })
  assert.equal((await ok('GET', `/classes/${S.cl}/finance`, { token: S.admin })).totals.paid, 10000)
})

test('inscription : dossier, parent, effectif maximum', async () => {
  assert.equal((await call('POST', `/classes/${S.cl}/inscriptions`, { token: S.t1, body: { name: 'NEW Eleve', parentPhone: '70123456' } })).status, 403)
  assert.equal((await call('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: { name: 'NEW Eleve', parentPhone: 'abc' } })).status, 400)
  assert.equal((await call('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: { name: 'NEW Eleve' } })).status, 400, 'numéro à contacter obligatoire')
  assert.equal((await call('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: { name: 'NEW Eleve', parentPhone: '1234' } })).status, 400, 'numéro trop court')
  const r = await ok('POST', `/classes/${S.cl}/inscriptions`, {
    token: S.staff, body: { name: 'OUEDRAOGO Salif', parentName: 'M. Ouédraogo', parentPhone: '70 12 34 56', parentEmail: 'p@ex.bf', paiement: { amount: 10000, method: 'especes' } },
  })
  assert.equal(r.paiement.amount, 10000); S.e3 = r.id
  const el = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.find(e => e.id === S.e3)
  assert.deepEqual([el.status, el.parentName, el.parentPhone], ['enrolled', 'M. Ouédraogo', '70 12 34 56'])
  assert.equal((await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })).eleves.find(e => e.id === S.e3).parentPhone, undefined, 'coordonnées parents : administration seulement')
  assert.equal((await call('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: { name: 'OUEDRAOGO Salif', parentPhone: '70123456' } })).status, 409, 'doublon refusé')
  // fiche d'identité complète
  const fiche = await ok('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: {
    name: 'FICHE Complete', parentPhone: '70123456', parentPhone2: '76 11 22 33', parentRelation: 'mere', parentName: 'Mme Fiche',
    sex: 'F', birthDate: '2012-05-14', birthPlace: 'Ouagadougou', nationality: 'Burkinabè', address: 'Secteur 15, Bogodogo', previousSchool: 'École Wemtenga', repeater: true, health: 'Allergie à la pénicilline' } })
  const fcl = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.find(e => e.id === fiche.id)
  assert.deepEqual([fcl.sex, fcl.birthDate, fcl.birthPlace, fcl.repeater, fcl.parentRelation, fcl.parentPhone2, fcl.previousSchool, fcl.health],
    ['F', '2012-05-14', 'Ouagadougou', true, 'mere', '76 11 22 33', 'École Wemtenga', 'Allergie à la pénicilline'])
  assert.equal((await ok('GET', `/classes/${S.cl}/full`, { token: S.t1 })).eleves.find(e => e.id === fiche.id).health, undefined, 'fiche personnelle : administration seulement')
  for (const bad of [{ sex: 'X' }, { birthDate: '2999-01-01' }, { birthDate: '14/05/2012' }, { parentRelation: 'oncle' }, { parentPhone2: '12' }])
    assert.equal((await call('PUT', `/eleves/${fiche.id}`, { token: S.staff, body: bad })).status, 400, JSON.stringify(bad))
  await ok('PUT', `/eleves/${fiche.id}`, { token: S.staff, body: { birthDate: '2012-06-01', sex: 'M', health: '' } })
  const maj = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.find(e => e.id === fiche.id)
  assert.deepEqual([maj.birthDate, maj.sex, maj.health], ['2012-06-01', 'M', ''])
  const trace = (await ok('GET', '/audit?action=eleve_modifie', { token: S.admin }))[0]
  assert.deepEqual(trace.detail.changes.birthDate, ['2012-05-14', '2012-06-01'], 'modification de la fiche tracée')
  await ok('PUT', `/eleves/${fiche.id}`, { token: S.staff, body: { status: 'withdrawn' } })   // ne compte plus dans l'effectif ci-dessous
  // effectif maximum
  const base = { capacity: 4, inscription: 10000, scolarite: 90000, modalite: 'trimestriel' }
  await ok('PUT', `/classes/${S.cl}/finance`, { token: S.admin, body: base })
  assert.equal((await call('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: { name: 'TROP Tard', parentPhone: '70123456' } })).status, 409, 'classe complète')
  await ok('PUT', `/eleves/${S.e3}`, { token: S.staff, body: { status: 'withdrawn' } })
  await ok('POST', `/classes/${S.cl}/inscriptions`, { token: S.staff, body: { name: 'PLACE Libre', status: 'pending', parentPhone: '70123456' } })
  const ov = await ok('GET', '/inscriptions', { token: S.staff })
  const c = ov.classes.find(x => x.id === S.cl)
  assert.deepEqual([c.enrolled, c.pending, c.withdrawn, c.capacity, c.free], [3, 1, 2, 4, 0])
  await ok('PUT', `/classes/${S.cl}/finance`, { token: S.admin, body: { ...base, capacity: 0 } })
})

test('emploi du temps : conflits de classe et d’enseignant', async () => {
  const cr = (token, classe, body) => call('POST', `/classes/${classe}/creneaux`, { token, body })
  assert.equal((await cr(S.staff, S.cl, { matiereId: S.maths, day: 1, start: '08:00', end: '10:00' })).status, 403, 'administrateur seul')
  assert.equal((await cr(S.admin, S.cl, { matiereId: S.maths, day: 1, start: '10:00', end: '08:00' })).status, 400)
  const c1 = await ok('POST', `/classes/${S.cl}/creneaux`, { token: S.admin, body: { matiereId: S.maths, day: 1, start: '08:00', end: '10:00', room: 'Salle 3' } })
  assert.deepEqual([c1.matiere, c1.teacher, c1.start], ['Mathématiques', 'M. Kaboré', '08:00'])
  assert.equal((await cr(S.admin, S.cl, { matiereId: S.fr, day: 1, start: '09:00', end: '11:00' })).status, 409, 'la classe a déjà un cours')
  await ok('POST', `/classes/${S.cl}/creneaux`, { token: S.admin, body: { matiereId: S.fr, day: 1, start: '10:00', end: '12:00' } })   // bout à bout : accepté
  // même enseignant dans une autre classe au même moment
  const other = (await ok('POST', '/classes', { token: S.admin, body: { name: '5è', defaults: false } })).id
  const m5 = (await ok('POST', `/classes/${other}/matieres`, { token: S.admin, body: { name: 'Maths 5', coef: 2, teacher: S.t1id } })).id
  assert.equal((await cr(S.admin, other, { matiereId: m5, day: 1, start: '09:00', end: '10:00' })).status, 409, 'M. Kaboré est déjà en cours')
  await ok('POST', `/classes/${other}/creneaux`, { token: S.admin, body: { matiereId: m5, day: 2, start: '09:00', end: '10:00' } })
  // consultation
  const mine = await ok('GET', '/emploi-du-temps/mon', { token: S.t1 })
  assert.deepEqual(mine.creneaux.map(c => [c.classe, c.day]), [['6è', 1], ['5è', 2]])
  assert.equal((await ok('GET', `/classes/${S.cl}/emploi-du-temps`, { token: S.t2 })).creneaux.length, 2)
  assert.equal((await call('GET', `/classes/${S.cl}/emploi-du-temps`, { token: S.t3 })).status, 403)
  assert.equal((await call('GET', '/emploi-du-temps/mon', { token: S.staff })).status, 403)
  const tout = await ok('GET', '/emploi-du-temps', { token: S.staff })
  assert.deepEqual([...new Set(tout.creneaux.map(c => c.classe))], ['5è', '6è'], 'tout le programme, classé par classe')
  assert.equal((await call('GET', '/emploi-du-temps', { token: S.t1 })).status, 403)
  // déplacer un cours
  await ok('PUT', `/creneaux/${c1.id}`, { token: S.admin, body: { start: '08:00', end: '09:30' } })
  await ok('DELETE', `/creneaux/${c1.id}`, { token: S.admin })
  await ok('DELETE', `/classes/${other}`, { token: S.admin })
  assert.equal(await mongoose.models.Creneau.countDocuments({ classe: other }), 0)
})

test('communication avec les parents et justification des absences', async () => {
  const send = (token, body) => call('POST', '/messages', { token, body })
  assert.equal((await send(S.t1, { audience: 'classe', classeId: S.cl, channel: 'sms', body: 'Bonjour' })).status, 403)
  assert.equal((await send(S.staff, { audience: 'classe', channel: 'sms', body: 'Bonjour' })).status, 400, 'classe obligatoire')
  await ok('PUT', `/eleves/${S.e1}`, { token: S.staff, body: { parentName: 'Mme Sawadogo', parentPhone: '+226 70 00 00 01' } })
  const m = await ok('POST', '/messages', { token: S.staff, body: { audience: 'classe', classeId: S.cl, channel: 'whatsapp', body: 'Bonjour {parent}, réunion pour {eleve} ({classe}).' } })
  assert.equal(m.recipients.length, 2, 'Awa et le dossier en attente (numéro obligatoire)')
  const awa = m.recipients.find(r => r.eleveId === S.e1)
  assert.equal(awa.phone, '22670000001')
  assert.equal(awa.text, 'Bonjour Mme Sawadogo, réunion pour SAWADOGO Awa (6è).')
  assert.ok(m.missing.length >= 2, 'élèves sans numéro signalés')
  const sms = await ok('POST', '/messages', { token: S.staff, body: { audience: 'eleve', eleveId: S.e1, channel: 'sms', body: 'Solde : {solde}' } })
  assert.match(sms.recipients[0].text, /^Solde : 90 000 FCFA$/)
  assert.equal((await send(S.staff, { audience: 'eleve', eleveId: S.e1, channel: 'email', body: 'x' })).status, 201, 'sans e-mail : signalé, pas d’erreur')
  const hist = await ok('GET', '/messages', { token: S.admin })
  assert.equal(hist[0].channel, 'email'); assert.ok(hist.length >= 3)
  assert.equal((await call('GET', '/messages', { token: S.t1 })).status, 403)

  // justification d'une absence
  const inc = await ok('POST', `/eleves/${S.e1}/incidents`, { token: S.t1, body: { tr: 0, type: 'absence', hours: 2 } })
  assert.equal(inc.justified, false)
  assert.equal((await call('PUT', `/incidents/${inc.id}`, { token: S.t1, body: { justified: true } })).status, 403)
  assert.equal((await ok('PUT', `/incidents/${inc.id}`, { token: S.staff, body: { justified: true } })).justified, true)
  const retard = await ok('POST', `/eleves/${S.e1}/incidents`, { token: S.t1, body: { tr: 0, type: 'retard', minutes: 10 } })
  assert.equal((await call('PUT', `/incidents/${retard.id}`, { token: S.admin, body: { justified: true } })).status, 400)
})

test('dépôt chiffré des devoirs : seul le texte chiffré transite, accès par profil', async () => {
  const sealed = Buffer.from('CHIFFRE-' + 'x'.repeat(200))
  const meta = { classeId: S.cl, matiereId: S.maths, title: 'Devoir 1 — Maths', note: 'Sujet du 12 octobre', size: 150, salt: 'c2VsLXNlbC1zZWwtc2Vs', iv: 'aXYtaXYtaXYtaXY=', iter: 310000 }
  const up = (token, id, body) => fetch(`${base}/devoirs/${id}/fichier`, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/octet-stream' }, body })
  const get = (token, id) => fetch(`${base}/devoirs/${id}/fichier`, { headers: { authorization: 'Bearer ' + token } })

  assert.equal((await call('POST', '/devoirs', { token: S.admin, body: meta })).status, 403, 'dépôt réservé aux enseignants')
  assert.equal((await call('POST', '/devoirs', { token: S.t2, body: meta })).status, 403, 'pas dans la matière d’un collègue')
  assert.equal((await call('POST', '/devoirs', { token: S.t1, body: { ...meta, iter: 10 } })).status, 400, 'dérivation de clé trop faible')
  const d = await ok('POST', '/devoirs', { token: S.t1, body: meta })
  assert.equal(d.sealed, false); assert.equal(d.matiere, 'Mathématiques'); assert.equal(d.data, undefined)
  assert.equal((await up(S.t2, d.id, sealed)).status, 404, 'seul l’auteur envoie le fichier')
  assert.equal((await up(S.t1, d.id, Buffer.from('court'))).status, 400)
  assert.equal((await up(S.t1, d.id, sealed)).status, 200)
  assert.equal((await up(S.t1, d.id, sealed)).status, 409, 'une seule fois')

  // administration et auteur récupèrent exactement les octets chiffrés ; un autre enseignant non
  for (const t of [S.admin, S.staff, S.t1]) { const r = await get(t, d.id); assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()), sealed) }
  assert.equal((await get(S.t2, d.id)).status, 403)
  assert.equal((await ok('GET', '/devoirs', { token: S.admin })).length, 1)
  assert.equal((await ok('GET', '/devoirs', { token: S.admin }))[0].annee, (await import('../src/utils/year.js')).currentSchoolYear())
  assert.equal((await ok('GET', '/devoirs', { token: S.t1 })).length, 1)
  assert.equal((await ok('GET', '/devoirs', { token: S.t2 })).length, 0, 'chacun ne voit que les siens')
  const rawInDb = await mongoose.models.Devoir.findById(d.id).select('+data').lean()
  assert.deepEqual(Buffer.from(rawInDb.data.buffer), sealed, 'la base ne contient que le texte chiffré')
  assert.equal((await call('DELETE', `/devoirs/${d.id}`, { token: S.t2 })).status, 403)
  assert.equal((await call('DELETE', `/devoirs/${d.id}`, { token: S.admin })).status, 403, 'l’administration ne supprime pas un dépôt')
  assert.equal((await call('DELETE', `/devoirs/${d.id}`, { token: S.staff })).status, 403)
  await ok('DELETE', `/devoirs/${d.id}`, { token: S.t1 })
  assert.equal((await ok('GET', '/devoirs', { token: S.admin })).length, 0)
})

test('années scolaires : l’année réelle reste valide, on peut préparer la suivante et consulter les archives', async () => {
  const { currentSchoolYear } = await import('../src/utils/year.js')
  const cur = currentSchoolYear(), start = parseInt(cur, 10)
  const next = `${start + 1}-${start + 2}`, prev = `${start - 1}-${start}`
  const put = (token, body) => call('PUT', '/school/annee', { token, body })
  const note = value => call('PUT', '/notes', { token: S.t1, body: { eleveId: S.e1, matiereId: S.maths, tr: 0, k: 0, value } })
  assert.equal((await ok('GET', '/school', { token: S.admin })).annee, cur, 'un nouvel établissement démarre sur l’année réelle')
  assert.equal((await put(S.t1, { annee: next, create: true })).status, 403)
  assert.equal((await put(S.staff, { annee: next, create: true })).status, 403)
  assert.equal((await put(S.admin, { annee: `${start}-${start + 2}` })).status, 400, 'deux années consécutives')
  assert.equal((await put(S.admin, { annee: '2090-2091' })).status, 404, 'inexistante sans création')
  const eleves = (await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.length

  // préparer l'année suivante : classes, matières, enseignants et frais repris, sans les élèves
  const sch = await ok('PUT', '/school/annee', { token: S.admin, body: { annee: next, create: true, copyFrom: cur } })
  assert.equal(sch.annee, next); assert.deepEqual(sch.annees, [cur, next])
  const list = await ok('GET', '/classes', { token: S.admin })
  assert.equal(list.length, 1); assert.notEqual(list[0].id, S.cl); assert.equal(list[0].nbEleves, 0); assert.equal(list[0].nbMatieres, 6)
  assert.equal((await call('GET', `/classes/${S.cl}/full`, { token: S.admin })).status, 404, 'les données de l’autre année ne sont pas visibles')
  const fin = await ok('GET', `/classes/${list[0].id}/finance`, { token: S.admin })
  assert.equal(fin.plan.scolarite, 90000); assert.equal(fin.plan.tranches[0].due.slice(0, 4), String(start + 1), 'échéances décalées d’un an')
  assert.equal((await ok('GET', '/classes', { token: S.t1 })).length, 1)
  await ok('POST', `/classes/${list[0].id}/eleves`, { token: S.admin, body: { names: ['NOUVEAU Eleve'] } })

  // retour sur l'année réelle : elle reste PLEINEMENT valide malgré l'année suivante déjà ouverte
  await ok('PUT', '/school/annee', { token: S.admin, body: { annee: cur } })
  assert.equal((await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })).eleves.length, eleves)
  assert.equal((await note('10')).status, 200, 'l’enseignant continue de saisir dans l’année en cours')
  await ok('PUT', `/eleves/${S.e1}`, { token: S.staff, body: { parentName: 'Mme Sawadogo' } })

  // une année TERMINÉE est en consultation seule pour les enseignants ; l'administration garde la main
  await ok('PUT', '/school/annee', { token: S.admin, body: { annee: prev, create: true } })
  assert.equal((await call('GET', '/classes', { token: S.t1 })).status, 200, 'consultation autorisée')
  assert.equal((await note('11')).status, 403, 'enseignant : lecture seule sur une année terminée')
  await ok('POST', '/classes', { token: S.admin, body: { name: 'Archive 6è' } })
  await ok('PUT', '/school/annee', { token: S.admin, body: { annee: cur } })
  assert.equal((await note('12')).status, 200, 'retour à l’année réelle : saisie de nouveau possible')
  assert.equal((await ok('GET', '/messages', { token: S.admin })).length >= 3, true, 'les messages suivent l’année')
})

test('licences : création d’établissement sur code, expiration, renouvellement, limite d’élèves, contrôle du propriétaire', async () => {
  const reg = (login, license) => call('POST', '/auth/register', { body: { school: 'Lycée ' + login, name: 'Dir', login, password: 'motdepasse9', license } })
  // étape 1 : le code est vérifié AVANT le formulaire, sans être consommé
  const check = code => call('POST', '/licence/verifier', { body: { code } })
  const pre = await lic({ days: 45, maxStudents: 7 })
  const good = await check(pre)
  assert.deepEqual([good.status, good.body.valid, good.body.days, good.body.maxStudents], [200, true, 45, 7])
  assert.deepEqual(Object.keys(good.body).sort(), ['days', 'maxStudents', 'valid'], 'rien d’autre que la durée et la limite')
  assert.equal((await check(pre.toLowerCase().replace(/-/g, ' '))).status, 200, 'saisie tolérante')
  assert.equal((await check('EDV-AAAA-BBBB-CCCC-DDDD')).status, 400, 'code inconnu')
  assert.equal((await check('')).status, 400)
  const ann = await lic({ status: 'revoked' })
  assert.equal((await check(ann)).status, 400, 'code annulé')
  assert.equal((await check(pre)).status, 200, 'vérifier ne consomme pas le code')
  const first = await reg('etape.lic', pre)
  assert.equal(first.status, 201)
  assert.equal((await check(pre)).status, 400, 'une fois utilisé, le code ne passe plus la vérification')

  // pas de code, mauvais code : aucun établissement créé
  assert.equal((await reg('lic.un', undefined)).status, 400, 'code obligatoire')
  const wrong = await reg('lic.deux', 'EDV-AAAA-BBBB-CCCC-DDDD')
  assert.equal(wrong.status, 400); assert.match(wrong.body.error, /invalide|utilisé|annulé/)
  assert.equal(await mongoose.models.School.countDocuments({ name: /Lycée lic\./ }), 0)

  // un code = un seul établissement ; saisie tolérante (minuscules, sans tirets)
  const c1 = await lic({ days: 30, maxStudents: 2, note: 'Test limite' })
  const ok1 = await reg('lic.trois', c1.toLowerCase().replace(/-/g, ' '))
  assert.equal(ok1.status, 201)
  const exp = new Date(ok1.body.school.licenseExpires).getTime()
  assert.ok(Math.abs(exp - (Date.now() + 30 * 86400000)) < 120000, 'la durée démarre à l’activation')
  assert.equal(ok1.body.school.maxStudents, 2); assert.equal(ok1.body.school.licenseCode, undefined, 'le code n’est jamais renvoyé')
  assert.equal((await reg('lic.quatre', c1)).status, 400, 'code déjà utilisé')
  const adm = ok1.body.token
  assert.equal(await mongoose.models.School.countDocuments({ name: 'Lycée lic.quatre' }), 0)

  // limite d'élèves de la licence
  const cl = (await ok('POST', '/classes', { token: adm, body: { name: '6è' } })).id
  assert.deepEqual(await ok('POST', `/classes/${cl}/eleves`, { token: adm, body: { names: ['A UN', 'B DEUX'] } }), { added: 2, skipped: 0 })
  const over = await call('POST', `/classes/${cl}/eleves`, { token: adm, body: { names: ['C TROIS'] } })
  assert.equal(over.status, 403); assert.match(over.body.error, /Limite de la licence/)
  assert.equal((await call('POST', `/classes/${cl}/inscriptions`, { token: adm, body: { name: 'D QUATRE', parentPhone: '70123456' } })).status, 403)
  const st = await ok('GET', '/licence', { token: adm })
  assert.deepEqual([st.valid, st.students, st.maxStudents], [true, 2, 2])

  // expiration : tout est verrouillé (402) sauf l'état de la licence et le renouvellement
  const School = mongoose.models.School
  const sid = ok1.body.school.id
  await School.updateOne({ _id: sid }, { $set: { licenseExpires: new Date(Date.now() - 1000) } })
  for (const [m, p] of [['GET', '/classes'], ['GET', `/classes/${cl}/full`], ['GET', '/users'], ['GET', '/audit']]) {
    const r = await call(m, p, { token: adm })
    assert.equal(r.status, 402, `${p} verrouillé`); assert.match(r.body.error, /Licence expirée/)
  }
  assert.equal((await call('GET', '/me', { token: adm })).status, 200, 'on peut toujours savoir où on en est')
  assert.equal((await ok('GET', '/licence', { token: adm })).valid, false)
  assert.equal((await call('POST', '/auth/login', { body: { login: 'lic.trois', password: 'motdepasse9' } })).status, 200, 'la connexion reste possible pour renouveler')
  // renouvellement : mauvais code, code déjà utilisé, puis bon code
  assert.equal((await call('POST', '/licence/renew', { token: adm, body: { code: 'EDV-ZZZZ-ZZZZ-ZZZZ-ZZZZ' } })).status, 400)
  assert.equal((await call('POST', '/licence/renew', { token: adm, body: { code: c1 } })).status, 400, 'ancien code déjà utilisé')
  const c2 = await lic({ days: 100, maxStudents: 50 })
  const renewed = await ok('POST', '/licence/renew', { token: adm, body: { code: c2 } })
  assert.ok(Math.abs(new Date(renewed.licenseExpires).getTime() - (Date.now() + 100 * 86400000)) < 120000, 'expirée : la durée repart d’aujourd’hui')
  assert.equal(renewed.maxStudents, 50)
  assert.equal((await call('GET', '/classes', { token: adm })).status, 200, 'déverrouillé')
  // renouveler AVANT l'expiration ajoute la durée à ce qui reste
  const c3 = await lic({ days: 10 })
  const again = await ok('POST', '/licence/renew', { token: adm, body: { code: c3 } })
  assert.ok(Math.abs(new Date(again.licenseExpires).getTime() - (Date.now() + 110 * 86400000)) < 120000, 'la durée s’additionne')
  // seul l'administrateur renouvelle
  const t = await ok('POST', '/users', { token: adm, body: { login: 'lic.prof', name: 'Prof', role: 'teacher', password: 'provisoire1' } })
  const tok = (await ok('POST', '/auth/login', { body: { login: 'lic.prof', password: 'provisoire1' } })).token
  assert.equal((await call('POST', '/licence/renew', { token: tok, body: { code: await lic() } })).status, 403)

  // propriétaire : clé secrète obligatoire, création, annulation immédiate, rétablissement, prolongation
  const owner = (m, p, body, key = process.env.OWNER_KEY) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(key ? { 'x-owner-key': key } : {}) }, body: body && JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  assert.equal((await owner('GET', '/owner/licences', undefined, 'mauvaise-cle-mauvaise-cle-123')).status, 401)
  assert.equal((await owner('GET', '/owner/licences', undefined, null)).status, 401)
  assert.equal((await call('GET', '/owner/licences', { token: adm })).status, 401, 'un administrateur d’école n’est pas le propriétaire')
  const made = await owner('POST', '/owner/licences', { days: 90, maxStudents: 300, note: 'Lycée Test', count: 2 })
  assert.equal(made.status, 201); assert.equal(made.body.length, 2); assert.match(made.body[0].code, /^EDV-[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
  assert.equal((await owner('POST', '/owner/licences', { days: 0 })).status, 400)
  const listed = (await owner('GET', '/owner/licences')).body
  assert.equal(listed.find(l => l.code === c2).school.name, 'Lycée lic.trois'); assert.equal(listed.find(l => l.code === made.body[0].code).state, 'libre')
  assert.equal((await call('GET', '/classes', { token: adm })).status, 200)
  await owner('POST', `/owner/licences/${c3}/revoke`)   // c3 = la licence en cours de l'établissement
  const cut = await call('GET', '/classes', { token: adm })
  assert.equal(cut.status, 402); assert.match(cut.body.error, /suspendue/)
  const c4 = await lic()
  await owner('POST', `/owner/licences/${c4}/revoke`)
  assert.equal((await reg('lic.cinq', c4)).status, 400, 'un code annulé ne peut plus créer d’établissement')
  await owner('POST', `/owner/licences/${c3}/restore`)
  assert.equal((await call('GET', '/classes', { token: adm })).status, 200)
  const before = new Date((await ok('GET', '/licence', { token: adm })).expires).getTime()
  await owner('POST', `/owner/licences/${c2}/extend`, { days: 30 })
  assert.ok(Math.abs(new Date((await ok('GET', '/licence', { token: adm })).expires).getTime() - (before + 30 * 86400000)) < 5000, 'prolongation')
  // sans OWNER_KEY configurée, l'interface propriétaire n'existe pas
  const keep = process.env.OWNER_KEY
  delete process.env.OWNER_KEY
  assert.equal((await owner('GET', '/owner/licences', undefined, keep)).status, 404)
  process.env.OWNER_KEY = keep
})

test('isolation entre établissements', async () => {
  const b = await ok('POST', '/auth/register', { body: { school: 'Lycée B', name: 'Dir B', login: 'adm.b', password: 'motdepasse2', license: await lic() } })
  assert.equal((await call('GET', `/classes/${S.cl}/full`, { token: b.token })).status, 404)
  assert.equal((await call('PUT', '/notes', { token: b.token, body: { eleveId: S.e1, matiereId: S.maths, tr: 0, k: 0, value: '1' } })).status, 404)
  assert.equal((await call('PUT', `/users/${S.t1id}`, { token: b.token, body: { active: false } })).status, 404)
  assert.equal((await ok('GET', '/classes', { token: b.token })).length, 0)
  assert.equal((await ok('GET', '/users', { token: b.token })).length, 1)
})

test('suppression d’une matière efface ses notes ; comptes désactivés', async () => {
  await ok('DELETE', `/classes/${S.cl}/matieres/${S.maths}`, { token: S.admin })
  const full = await ok('GET', `/classes/${S.cl}/full`, { token: S.admin })
  assert.equal(full.matieres.length, 5)
  assert.equal(full.eleves.find(e => e.id === S.e1).notes[0]?.[S.maths], undefined)
  await ok('PUT', `/users/${S.t3id}`, { token: S.admin, body: { active: false } })
  assert.equal((await call('POST', '/auth/login', { body: { login: 'sans.classe', password: 'autremdp123' } })).status, 403)
  assert.equal((await call('GET', '/me', { token: S.t3 })).status, 401, 'jeton existant rejeté')
  const me = (await ok('GET', '/me', { token: S.admin })).user
  assert.equal((await call('PUT', `/users/${me.id}`, { token: S.admin, body: { active: false } })).status, 400, 'le dernier admin reste')
  // suppression de la classe : les élèves partent avec
  await ok('DELETE', `/classes/${S.cl}`, { token: S.admin })
  assert.equal((await call('GET', `/classes/${S.cl}/full`, { token: S.admin })).status, 404)
  assert.equal(await mongoose.models.Eleve.countDocuments({ classe: S.cl }), 0)
})
