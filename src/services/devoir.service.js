import { Classe, Devoir } from '../models/index.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js'
import { isOffice } from '../policies/access.js'
import { findClasse } from './classe.service.js'

export const MAX_BYTES = 9 * 1024 * 1024

const dto = (d, classes) => {
  const c = classes.get(String(d.classe))
  return {
    id: String(d._id), classeId: String(d.classe), classe: c?.name || '(classe supprimée)',
    matiereId: String(d.matiere), matiere: c?.matieres.id(d.matiere)?.name || '(matière supprimée)',
    annee: d.annee, title: d.title, note: d.note, size: d.size, sealed: d.sealed, salt: d.salt, iv: d.iv, iter: d.iter,
    byId: String(d.by), byName: d.byName, at: d.createdAt,
  }
}

// Administration : tous les dépôts, toutes années confondues (un dépôt reste ouvrable même si l'année affichée a changé) ;
// enseignant : les siens
export async function list(user) {
  const filter = { school: user.school, ...(isOffice(user) ? {} : { by: user._id }) }
  const docs = await Devoir.find(filter).sort('-createdAt').limit(300)
  const classes = await Classe.find({ _id: { $in: [...new Set(docs.map(d => String(d.classe)))] } })
  const by = new Map(classes.map(c => [String(c._id), c]))
  return docs.map(d => dto(d, by))
}

// Un professeur ne dépose que dans une matière dont il est responsable
export async function create(user, data) {
  const classe = await findClasse(user, data.classeId)
  const matiere = classe.matieres.id(data.matiereId)
  if (!matiere) throw notFound('Matière introuvable pour cette classe')
  if (String(matiere.teacher) !== user.id) throw forbidden('Vous ne pouvez déposer un devoir que dans votre propre matière')
  const d = await Devoir.create({
    school: user.school, annee: user.annee, classe: classe._id, matiere: matiere._id,
    title: data.title, note: data.note || '', size: data.size, salt: data.salt, iv: data.iv, iter: data.iter,
    by: user._id, byName: user.name,
  })
  return dto(d, new Map([[String(classe._id), classe]]))
}

// Réception du texte chiffré (une seule fois)
export async function upload(user, id, buffer) {
  const d = await Devoir.findOne({ _id: id, school: user.school, by: user._id }).select('+data')
  if (!d) throw notFound('Dépôt introuvable')
  if (d.sealed) throw conflict('Le fichier de ce dépôt est déjà enregistré')
  if (!Buffer.isBuffer(buffer) || buffer.length < 17) throw badRequest('Fichier chiffré manquant')
  if (buffer.length > MAX_BYTES + 1024) throw badRequest('Fichier trop volumineux (8 Mo au maximum)')
  d.data = buffer; d.sealed = true
  await d.save()
}

export async function download(user, id) {
  const d = await Devoir.findOne({ _id: id, school: user.school }).select('+data')
  if (!d) throw notFound('Dépôt introuvable')
  if (!isOffice(user) && String(d.by) !== user.id) throw forbidden('Ce dépôt appartient à un autre enseignant')
  if (!d.sealed || !d.data) throw notFound('Fichier non reçu')
  return d.data
}

export async function remove(user, id) {
  const d = await Devoir.findOne({ _id: id, school: user.school })
  if (!d) throw notFound('Dépôt introuvable')
  if (String(d.by) !== user.id) throw forbidden('Seul le professeur qui a déposé le fichier peut le supprimer')
  await d.deleteOne()
}
