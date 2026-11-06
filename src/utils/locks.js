export const TRIM = ['1er trimestre', '2e trimestre', '3e trimestre']
export const lockedMessage = (classe, tr) =>
  `Le ${TRIM[tr]} est verrouillé pour la ${classe.name} (conseil de classe terminé) : l’administrateur doit le déverrouiller avant toute modification`
