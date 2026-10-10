/**
 * Valida archivos de preguntas sin tocar la base de datos.
 *   npm run questions:validate                       (valida data/questions)
 *   npx tsx src/cli/validate.ts archivo.csv otra/carpeta [--strict] [--all] [--threshold=0.75]
 * --strict: los posibles duplicados por similitud cuentan como error.
 * Sale con código 1 si hay errores.
 */
import { loadAndValidate, parseArgs, printDistribution, printIssues } from './common';

const { flags, values, positional } = parseArgs(process.argv.slice(2));
const paths = positional.length ? positional : ['data/questions'];
const limit = flags.has('all') ? Infinity : 40;

try {
  const { records, files, report } = loadAndValidate(paths, {
    strictSimilarity: flags.has('strict'),
    similarityThreshold: values.threshold ? Number(values.threshold) : undefined,
  });
  console.log(`Archivos: ${files.length} · Registros leídos: ${records.length}`);
  printIssues('✖ Errores', report.errors, limit);
  printIssues('⚠ Avisos', report.warnings, limit);
  console.log('');
  printDistribution(report.valid);
  if (report.errors.length) {
    console.log(`\n✖ ${report.errors.length} errores: corrígelos antes de importar.`);
    process.exit(1);
  }
  console.log('\n✔ Validación correcta.');
} catch (err) {
  console.error(`✖ ${(err as Error).message}`);
  process.exit(1);
}
