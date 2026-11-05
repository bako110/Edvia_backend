import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// Les tests n'utilisent JAMAIS la base du fichier .env (Atlas, production…) : base locale dédiée,
// ou celle de MONGODB_TEST_URI si elle est définie. Chaque exécution crée une base temporaire puis la supprime.
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017'
process.env.JWT_SECRET = 'test-secret'
process.env.DB_NAME = 'edvia_test_' + Date.now()
const { connectDb, disconnectDb } = await import('../src/config/db.js')
const { createApp } = await import('../src/app.js')

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
  const reg = await ok('POST', '/auth/register', { body: { school: 'Lycée A', name: 'Directeur', login: 'adm.a', password: 'motdepasse1' } })
  assert.equal(reg.user.role, 'admin'); assert.equal(reg.school.name, 'Lycée A')
  assert.equal(reg.user.hash, undefined, 'le hash ne sort jamais')
  assert.equal((await call('POST', '/auth/register', { body: { school: 'X', name: 'Y', login: 'ADM.A', password: 'motdepasse1' } })).status, 409, 'identifiant unique sans tenir compte de la casse')
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
  await ok('POST', '/me/password', { token: S.t1, body: { old: 'provisoire1', password: 'nouveaumdp1' } })
  assert.equal((await ok('POST', '/auth/login', { body: { login: 'kabore', password: 'nouveaumdp1' } })).user.mustChange, false)
  // réinitialisation par l'administrateur
  await ok('PUT', `/users/${S.t3id}/password`, { token: S.admin, body: { password: 'autremdp123' } })
  assert.equal((await ok('POST', '/auth/login', { body: { login: 'sans.classe', password: 'autremdp123' } })).user.mustChange, true)
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
  const other = await ok('POST', '/auth/register', { body: { school: 'Lycée C', name: 'Dir C', login: 'adm.c', password: 'motdepasse3' } })
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

test('isolation entre établissements', async () => {
  const b = await ok('POST', '/auth/register', { body: { school: 'Lycée B', name: 'Dir B', login: 'adm.b', password: 'motdepasse2' } })
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
