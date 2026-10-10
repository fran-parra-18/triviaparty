/**
 * Importa preguntas desde archivos JSON o CSV (o carpetas) a la base de datos.
 *   npm run db:seed                                   (importa todo data/questions)
 *   npm run questions:import -- ruta/archivo.csv [--dry-run] [--prune] [--allow-errors]
 * --dry-run       muestra qué se haría sin escribir.
 * --prune         elimina de la BD las preguntas que no estén en los archivos importados.
 * --allow-errors  importa las preguntas válidas aunque otras tengan errores.
 * --quiet         no muestra los avisos de revisión (los errores sí).
 */
import { loadEnvFiles, readConfig } from '../config';
import { loadAndValidate, parseArgs, printDistribution, printIssues } from './common';

loadEnvFiles();
process.env.DATABASE_URL = readConfig().DATABASE_URL;

const { flags, positional } = parseArgs(process.argv.slice(2));
if (positional.length === 0) {
  console.error('Uso: npm run questions:import -- <archivo.json|archivo.csv|carpeta> [--dry-run] [--prune]');
  process.exit(1);
}
const limit = flags.has('all') ? Infinity : 40;

const { getPrisma, disconnectPrisma } = await import('../db');
const { importQuestions } = await import('../questions/importer');

try {
  const { records, files, report } = loadAndValidate(positional);
  console.log(`Archivos: ${files.length} · Registros leídos: ${records.length} · Válidos: ${report.valid.length}`);
  printIssues('✖ Errores', report.errors, limit);
  if (!flags.has('quiet')) printIssues('⚠ Avisos', report.warnings, Math.min(limit, 15));
  if (report.errors.length && !flags.has('allow-errors')) {
    console.error('\n✖ Hay errores de validación. Corrígelos o usa --allow-errors para importar solo las válidas.');
    process.exit(1);
  }
  const prisma = getPrisma();
  const result = await importQuestions(prisma, report.valid, { dryRun: flags.has('dry-run'), prune: flags.has('prune') });
  printIssues('✖ Conflictos con la base de datos (no importadas)', result.conflicts, limit);
  console.log(
    `\n${flags.has('dry-run') ? '[simulación] ' : ''}Nuevas: ${result.created} · Actualizadas: ${result.updated} · Sin cambios: ${result.unchanged}${flags.has('prune') ? ` · Eliminadas: ${result.pruned}` : ''}`,
  );
  const total = await prisma.question.count({ where: { active: true } });
  console.log(`Preguntas activas en la base de datos: ${total}`);
  if (flags.has('verbose')) printDistribution(report.valid);
  await disconnectPrisma();
} catch (err) {
  console.error(`✖ ${(err as Error).message}`);
  await disconnectPrisma();
  process.exit(1);
}
