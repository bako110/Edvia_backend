# Edvia_backend

API de gestion scolaire EDVIA (Node.js · Express 5 · MongoDB/Mongoose).

## Démarrer en local

```bash
npm install
cp .env.example .env     # puis renseigner les valeurs
npm start                # http://localhost:3001
npm test                 # base locale temporaire, jamais celle du .env
```

## Déployer (Render)

| Réglage | Valeur |
|---|---|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Variables d'environnement à définir sur la plateforme (le fichier `.env` n'est pas versionné) :

| Variable | Rôle |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | adresse MongoDB Atlas (`mongodb+srv://…/Edvia?…`) |
| `JWT_SECRET` | secret de session, 32 caractères minimum |
| `CORS_ORIGIN` | adresse du frontend (obligatoire en production) |

`PORT` est fourni par la plateforme. Dans Atlas, autoriser l'accès réseau de l'hébergeur (Network Access).
