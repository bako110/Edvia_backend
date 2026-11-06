// Champs d'une fiche élève (en plus du nom, du matricule, du statut, de la remise et du parent à contacter)
export const EXTRA_FIELDS = ['sex', 'birthPlace', 'nationality', 'address', 'previousSchool', 'repeater', 'health', 'parentRelation', 'parentPhone2']

const iso = d => (d ? new Date(d).toISOString().slice(0, 10) : '')
export const isoDate = iso

// Valeurs prêtes à être enregistrées à partir de la requête validée ('' = date effacée)
export function pickExtra(data) {
  const out = {}
  for (const k of EXTRA_FIELDS) if (data[k] !== undefined) out[k] = data[k]
  if (data.birthDate !== undefined) out.birthDate = data.birthDate ? new Date(data.birthDate + 'T00:00:00Z') : null
  return out
}

// Champs d'identité envoyés à l'administration (liste des élèves d'une classe)
export function extraDto(e) {
  const o = { birthDate: iso(e.birthDate) }
  for (const k of EXTRA_FIELDS) o[k] = e[k] ?? (k === 'repeater' ? false : '')
  return o
}

/* ---------- import en lot : on accepte les formats usuels et on ignore poliment ce qui n'est pas lisible ---------- */
const sp = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const phoneClean = v => sp(v).replace(/[^0-9+ ().-]/g, '').slice(0, 25)

// 14/05/2012 · 14-05-12 · 14.05.2012 · 2012-05-14 -> Date (UTC) ; sinon null
export function normDate(v) {
  const s = sp(v)
  if (!s) return null
  let y, m, d, r
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [r[1], r[2], r[3]]
  else if ((r = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/))) { d = r[1]; m = r[2]; y = r[3].length === 2 ? (Number(r[3]) > 30 ? '19' : '20') + r[3] : r[3] }
  else return null
  const date = new Date(Date.UTC(+y, +m - 1, +d))
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d) return null
  return date > new Date() || +y < 1980 ? null : date
}
export function normSex(v) {
  const s = sp(v).toLowerCase()
  if (/^(m|g|h|masculin|gar[cç]on|homme)$/.test(s)) return 'M'
  if (/^(f|fille|f[ée]minin|femme)$/.test(s)) return 'F'
  return ''
}
const yes = v => v === true || /^(oui|o|yes|y|true|1|x|redoublant(e)?)$/i.test(sp(v))

// Fiche d'un élève reçue en vrac -> valeurs sûres (aucune erreur : une valeur illisible devient vide)
export function normalizeRecord(r) {
  const mail = sp(r.parentEmail).toLowerCase()
  return {
    name: sp(r.name).replace(/;/g, ' ').slice(0, 100), matricule: sp(r.matricule).replace(/;/g, ' ').slice(0, 30),
    sex: normSex(r.sex), birthDate: normDate(r.birthDate), birthPlace: sp(r.birthPlace).slice(0, 80), nationality: sp(r.nationality).slice(0, 40),
    address: sp(r.address).slice(0, 160), previousSchool: sp(r.previousSchool).slice(0, 100), repeater: yes(r.repeater),
    parentName: sp(r.parentName).slice(0, 100), parentPhone: phoneClean(r.parentPhone), parentPhone2: phoneClean(r.parentPhone2),
    parentEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail.slice(0, 120) : '',
    parentRelation: ['pere', 'mere', 'tuteur', 'autre'].includes(r.parentRelation) ? r.parentRelation : '',
  }
}

// « NOM Prénoms ; matricule ; sexe ; naissance ; lieu ; parent ; téléphone » (tout sauf le nom est facultatif)
export function parseLine(line) {
  const [name, matricule, sex, birthDate, birthPlace, parentName, parentPhone] = String(line).split(';')
  return normalizeRecord({ name, matricule, sex, birthDate, birthPlace, parentName, parentPhone })
}
