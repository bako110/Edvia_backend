export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export const badRequest = m => new HttpError(400, m)
export const unauthorized = m => new HttpError(401, m)
export const forbidden = (m = 'Action non autorisée pour votre profil') => new HttpError(403, m)
export const notFound = m => new HttpError(404, m)
export const paymentRequired = m => new HttpError(402, m)
export const conflict = m => new HttpError(409, m)
