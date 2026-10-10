import { CATEGORIES, DIFFICULTIES } from '@trivia/shared';
import { readQuestionFiles } from '../questions/parse';
import type { NormalizedQuestion } from '../questions/schema';
import { validateRecords, type Issue, type ValidateOptions } from '../questions/validate';

export function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=', 2) as [string, string | undefined];
      if (v !== undefined) values[k] = v;
      else flags.add(k);
    } else positional.push(arg);
  }
  return { flags, values, positional };
}

export function printIssues(title: string, issues: Issue[], limit: number) {
  if (issues.length === 0) return;
  console.log(`\n${title} (${issues.length}):`);
  for (const i of issues.slice(0, limit)) console.log(`  · ${i.ref}${i.id ? ` [${i.id}]` : ''}: ${i.message}`);
  if (issues.length > limit) console.log(`  … y ${issues.length - limit} más (usa --all para verlos todos)`);
}

export function printDistribution(questions: NormalizedQuestion[]) {
  const rows = CATEGORIES.map((c) => {
    const qs = questions.filter((q) => q.categoryId === c.id);
    const by = Object.fromEntries(DIFFICULTIES.map((d) => [d, qs.filter((q) => q.difficulty === d).length]));
    return { Categoría: `${c.emoji} ${c.name}`, Fácil: by.facil, Media: by.media, Difícil: by.dificil, Total: qs.length };
  });
  console.table(rows);
  const total = questions.length;
  const by = DIFFICULTIES.map((d) => `${d}: ${questions.filter((q) => q.difficulty === d).length}`).join(' · ');
  console.log(`Total: ${total} preguntas válidas (${by})`);
}

export function loadAndValidate(paths: string[], opts: ValidateOptions = {}) {
  const { records, files } = readQuestionFiles(paths);
  const report = validateRecords(records, opts);
  return { records, files, report };
}
