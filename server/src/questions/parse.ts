import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

/** Registro "crudo" leído de un archivo, antes de validar. */
export interface RawRecord {
  ref: string; // archivo:posición, para los mensajes de error
  data: Record<string, unknown>;
}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/**
 * JSON admitido:
 *  1) Un arreglo de preguntas: [{ question, options, answer, ... }]
 *  2) Un objeto con valores por defecto para todo el archivo:
 *     { "category": "historia", "difficulty"?: "...", "source"?: "...", "questions": [ ... ] }
 */
export function parseJson(content: string, fileLabel: string): RawRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(content));
  } catch (err) {
    throw new Error(`${fileLabel}: JSON inválido (${(err as Error).message})`);
  }
  let defaults: Record<string, unknown> = {};
  let list: unknown;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)) {
    const { questions, ...rest } = parsed as { questions: unknown[] } & Record<string, unknown>;
    list = questions;
    defaults = Object.fromEntries(
      Object.entries(rest).filter(([k]) => ['category', 'difficulty', 'source', 'tags'].includes(k)),
    );
  } else {
    throw new Error(`${fileLabel}: se esperaba un arreglo o un objeto con la propiedad "questions"`);
  }
  return (list as unknown[]).map((item, i) => ({
    ref: `${fileLabel}#${i + 1}`,
    data: item && typeof item === 'object' ? { ...defaults, ...(item as Record<string, unknown>) } : { invalid: item },
  }));
}

/** Analizador CSV (RFC 4180): comillas dobles, saltos de línea entre comillas, separador , o ; */
export function parseCsvRows(content: string): string[][] {
  const text = stripBom(content);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const CSV_ALIASES: Record<string, string> = {
  pregunta: 'question',
  enunciado: 'question',
  respuesta: 'answer',
  correcta: 'answer',
  correct: 'answer',
  correctindex: 'answer',
  explicacion: 'explanation',
  categoria: 'category',
  dificultad: 'difficulty',
  fuente: 'source',
  etiquetas: 'tags',
};

/**
 * CSV admitido (encabezados en inglés o español):
 * id,question,option_a,option_b,option_c,option_d,answer,explanation,category,difficulty,source,tags
 * "answer" admite 0-3 o A-D. "tags" separadas por "|" o ",".
 */
export function parseCsv(content: string, fileLabel: string): RawRecord[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) =>
    h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[\s-]+/g, '_'),
  );
  const optionCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^(option|opcion)_?([a-d1-4])$/.test(h))
    .sort((a, b) => a.h.localeCompare(b.h));
  if (optionCols.length !== 4) {
    throw new Error(`${fileLabel}: el CSV debe tener 4 columnas de opciones (option_a … option_d)`);
  }
  return rows.slice(1).map((cells, r) => {
    const data: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (optionCols.some((o) => o.i === i)) return;
      const key = CSV_ALIASES[h] ?? h;
      const value = cells[i]?.trim();
      if (value !== undefined && value !== '') data[key] = value;
    });
    data.options = optionCols.map((o) => cells[o.i] ?? '');
    return { ref: `${fileLabel}:fila ${r + 2}`, data };
  });
}

/** Lee archivos .json/.csv (o directorios con ellos) y devuelve los registros crudos. */
export function readQuestionFiles(paths: string[]): { records: RawRecord[]; files: string[] } {
  const files: string[] = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const f of readdirSync(p).sort()) {
        if (['.json', '.csv'].includes(extname(f).toLowerCase())) files.push(join(p, f));
      }
    } else files.push(p);
  }
  const records: RawRecord[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const label = basename(file);
    const ext = extname(file).toLowerCase();
    if (ext === '.json') records.push(...parseJson(content, label));
    else if (ext === '.csv') records.push(...parseCsv(content, label));
    else throw new Error(`${label}: formato no admitido (usa .json o .csv)`);
  }
  return { records, files };
}
