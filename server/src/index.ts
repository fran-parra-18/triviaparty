import { loadEnvFiles, readConfig } from './config';

loadEnvFiles();
const config = readConfig();
process.env.DATABASE_URL = config.DATABASE_URL;

const { createTriviaApp } = await import('./app');
const { disconnectPrisma, getPrisma } = await import('./db');
const { ensureCategories } = await import('./questions/importer');
const { PrismaQuestionRepository } = await import('./questions/repository');
const { getLanAddresses } = await import('./utils/network');

const prisma = getPrisma();
try {
  await ensureCategories(prisma);
} catch (err) {
  console.error('\n✖ No se pudo conectar con la base de datos. ¿Ejecutaste "npm run db:migrate"?\n');
  console.error(err);
  process.exit(1);
}

const repository = new PrismaQuestionRepository(prisma);
const { total } = await repository.stats();
const app = createTriviaApp({ config, repository, prisma });

app.httpServer.listen(config.PORT, config.HOST, () => {
  const lan = getLanAddresses();
  const isDev = config.NODE_ENV === 'development';
  const clientPort = isDev ? config.CLIENT_DEV_PORT : config.PORT;
  console.log('\n🎉 Trivia Party');
  console.log(`   Servidor:          http://localhost:${config.PORT}  (${config.NODE_ENV})`);
  if (isDev) console.log(`   Cliente (Vite):    http://localhost:${clientPort}`);
  for (const ip of lan) console.log(`   Red local:         http://${ip}:${clientPort}`);
  if (config.PUBLIC_URL) console.log(`   URL pública (QR):  ${config.PUBLIC_URL}`);
  console.log(`   Preguntas activas: ${total}${total === 0 ? '  ⚠ ejecuta "npm run db:seed"' : ''}\n`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} recibido, cerrando…`);
  await app.close();
  await disconnectPrisma();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
