import type { RawRecord } from './parse';
import { normalizeText, questionInputSchema, toNormalized, type NormalizedQuestion } from './schema';

export interface Issue {
  ref: string;
  id?: string;
  message: string;
}

export interface ValidationReport {
  valid: NormalizedQuestion[];
  errors: Issue[];
  warnings: Issue[];
}

const FORBIDDEN_OPTIONS = [
  'todas las anteriores',
  'ninguna de las anteriores',
  'todas son correctas',
  'ninguna es correcta',
  'a y b',
  'b y c',
  'ninguna',
  'todas',
];

const STOPWORDS = new Set(
  'el la los las lo un una unos unas de del al a ante en entre y e o u ni que cual cuales quien quienes como cuando cuanto cuantos cuantas donde por para con sin sobre se su sus si no ya mi tu te me nos le les es son fue fueron era eran ser ha han hay esta este estos estas ese esa eso mas muy tiene tienen mayor menor primer primera primero nombre conocido conocida llama llamado llamada'.split(
    ' ',
  ),
);

/** Palabras significativas del enunciado (sin palabras vacías). Las cortas, como «Na» o «K», cuentan. */
export function contentTokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((w) => w.length > 0 && !STOPWORDS.has(w)));
}

/** Clave para comparar opciones entre sí: conserva signos y símbolos («−32 °F» ≠ «32 °F»). */
function optionKey(option: string): string {
  return option.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Comprobaciones de coherencia de una pregunta ya normalizada. Devuelve [errores, avisos]. */
export function checkCoherence(q: NormalizedQuestion): [string[], string[]] {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normOptions = q.options.map(normalizeText);
  if (new Set(q.options.map(optionKey)).size !== 4) errors.push('Hay opciones repetidas');
  if (normOptions.some((o) => o.length === 0)) errors.push('Hay opciones vacías');
  if (normOptions.some((o) => FORBIDDEN_OPTIONS.includes(o))) {
    errors.push('Opciones tipo "todas/ninguna de las anteriores" no se admiten: las opciones se barajan');
  }
  if (normOptions.includes(q.normalizedText)) errors.push('Una opción es igual al enunciado');
  if (q.answerIndex < 0 || q.answerIndex > 3) errors.push('Índice de respuesta fuera de rango');
  if (q.text.includes('?') && !q.text.includes('¿')) warnings.push('Falta el signo de apertura "¿"');
  if (q.text.includes('¿') && !q.text.includes('?')) warnings.push('Falta el signo de cierre "?"');
  const correct = normOptions[q.answerIndex] ?? '';
  if (correct.length > 4 && q.normalizedText.includes(correct)) {
    warnings.push(`La respuesta correcta aparece en el enunciado ("${q.options[q.answerIndex]}")`);
  }
  if (normalizeText(q.explanation).length < 15) errors.push('La explicación es demasiado corta');

  // Coherencia respuesta-explicación: si la explicación nombra una opción incorrecta y no la correcta,
  // es probable que el índice de la respuesta esté mal marcado.
  const explanation = ` ${normalizeText(q.explanation)} `;
  const mentions = (o: string) => o.length >= 3 && explanation.includes(` ${o} `);
  const mentionedWrong = normOptions.filter((o, i) => i !== q.answerIndex && mentions(o));
  if (!mentions(correct) && mentionedWrong.length === 1 && !normOptions.some((o, i) => i !== q.answerIndex && correct.includes(o))) {
    const wrong = q.options[normOptions.indexOf(mentionedWrong[0]!)];
    warnings.push(`La explicación menciona «${wrong}», que no es la respuesta marcada («${q.options[q.answerIndex]}»)`);
  }
  return [errors, warnings];
}

export interface ValidateOptions {
  /** Umbral de similitud (Jaccard de palabras) a partir del cual se avisa de un posible duplicado. */
  similarityThreshold?: number;
  /** Si es true, los posibles duplicados por similitud se tratan como errores. */
  strictSimilarity?: boolean;
}

/** Valida un lote completo: formato, coherencia, ids y enunciados duplicados, y casi duplicados. */
export function validateRecords(records: RawRecord[], opts: ValidateOptions = {}): ValidationReport {
  const threshold = opts.similarityThreshold ?? 0.75;
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const candidates: { ref: string; q: NormalizedQuestion }[] = [];

  for (const rec of records) {
    const parsed = questionInputSchema.safeParse(rec.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        errors.push({
          ref: rec.ref,
          id: typeof rec.data.id === 'string' ? rec.data.id : undefined,
          message: path ? `${path}: ${issue.message}` : issue.message,
        });
      }
      continue;
    }
    const q = toNormalized(parsed.data);
    const [errs, warns] = checkCoherence(q);
    errs.forEach((message) => errors.push({ ref: rec.ref, id: q.id, message }));
    warns.forEach((message) => warnings.push({ ref: rec.ref, id: q.id, message }));
    if (errs.length === 0) candidates.push({ ref: rec.ref, q });
  }

  // Duplicados exactos (id y enunciado normalizado).
  const byId = new Map<string, string>();
  const byText = new Map<string, string>();
  const unique: { ref: string; q: NormalizedQuestion }[] = [];
  for (const c of candidates) {
    const dupId = byId.get(c.q.id);
    const dupText = byText.get(c.q.normalizedText);
    if (dupId) {
      errors.push({ ref: c.ref, id: c.q.id, message: `id duplicado (ya usado en ${dupId})` });
      continue;
    }
    if (dupText) {
      errors.push({ ref: c.ref, id: c.q.id, message: `Enunciado duplicado de ${dupText}` });
      continue;
    }
    byId.set(c.q.id, c.ref);
    byText.set(c.q.normalizedText, c.ref);
    unique.push(c);
  }

  // Casi duplicados: enunciados muy parecidos, o mismo dato preguntado con palabras distintas.
  const tokens = unique.map((c) => contentTokens(c.q.normalizedText));
  const answers = unique.map((c) => normalizeText(c.q.options[c.q.answerIndex]!));
  const index = new Map<string, number[]>();
  tokens.forEach((set, i) => set.forEach((t) => (index.get(t) ?? index.set(t, []).get(t)!).push(i)));
  const rejected = new Set<number>();
  for (let i = 0; i < unique.length; i++) {
    const seen = new Set<number>();
    for (const t of tokens[i]!) {
      for (const j of index.get(t)!) {
        if (j <= i || seen.has(j)) continue;
        seen.add(j);
        const sim = jaccard(tokens[i]!, tokens[j]!);
        const sameAnswer = answers[i] === answers[j];
        if (sim >= threshold || (sameAnswer && sim >= 0.5)) {
          const message = `Posible duplicado de ${unique[i]!.ref} [${unique[i]!.q.id}] (similitud ${(sim * 100).toFixed(0)}%${sameAnswer ? ', misma respuesta' : ''})`;
          if (opts.strictSimilarity) {
            errors.push({ ref: unique[j]!.ref, id: unique[j]!.q.id, message });
            rejected.add(j);
          } else warnings.push({ ref: unique[j]!.ref, id: unique[j]!.q.id, message });
        }
      }
    }
  }

  return { valid: unique.filter((_, i) => !rejected.has(i)).map((c) => c.q), errors, warnings };
}
