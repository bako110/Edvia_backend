// Année scolaire réelle : elle commence en août (ex. novembre 2026 -> « 2026-2027 », mars 2027 -> « 2026-2027 »)
export function currentSchoolYear(date = new Date()) {
  const y = date.getFullYear(), start = date.getMonth() >= 7 ? y : y - 1
  return `${start}-${start + 1}`
}

/*
 * Une année est « archive » (consultation seule pour les enseignants) UNIQUEMENT si elle est terminée,
 * c'est-à-dire antérieure à l'année réelle. L'année en cours reste toujours modifiable, même quand l'administrateur
 * a déjà ouvert l'année suivante pour la préparer.
 */
export const isArchiveYear = (annee, now = new Date()) => annee < currentSchoolYear(now)
