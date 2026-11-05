import { config, checkConfig, summary } from './config/env.js'
import { connectDb, disconnectDb } from './config/db.js'
import { createApp } from './app.js'

checkConfig()
await connectDb()
const server = createApp().listen(config.port, () => {
  const s = summary()
  console.log(`EDVIA — http://localhost:${s.port}`)
  console.log(`  environnement : ${s.environnement} · base : ${s.base} · session : ${s.session}`)
  console.log(`  mongo : ${s.mongo} · dns : ${s.dns} · cors : ${s.cors} · secret JWT : ${s.secretJwt}`)
})

// arrêt propre (Ctrl+C, redémarrage du service)
const stop = () => server.close(async () => { await disconnectDb(); process.exit(0) })
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
