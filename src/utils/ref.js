import crypto from 'node:crypto'

// Référence publique d'un élève : 8 caractères au hasard (XXXX-XXXX), sans lien avec l'identifiant interne de la base.
// C'est elle qui est imprimée sur le bulletin et utilisée pour le vérifier.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function makeRef() {
  const b = crypto.randomBytes(8)
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % ALPHABET.length]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}
