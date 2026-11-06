// Une licence est valide si elle n'est pas annulée et pas expirée (fonction pure, utilisée partout)
export const licenseValid = (school, now = new Date()) =>
  !!school && school.licenseStatus !== 'revoked' && !!school.licenseExpires && new Date(school.licenseExpires) > now

export const daysLeft = (school, now = new Date()) =>
  school?.licenseExpires ? Math.max(0, Math.ceil((new Date(school.licenseExpires) - now) / 86_400_000)) : 0
