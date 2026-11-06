export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code }
}
export const badRequest = m => new HttpError(400, m)
export const unauthorized = m => new HttpError(401, m)
export const forbidden = (m = 'Action non autorisée pour votre profil') => new HttpError(403, m)
export const notFound = m => new HttpError(404, m)
// Licence expirée / suspendue : la session est refusée (l'interface déconnecte l'utilisateur et affiche le motif)
export const licenseLogout = m => new HttpError(401, m, 'license')
export const paymentRequired = m => new HttpError(402, m)
export const conflict = m => new HttpError(409, m)
