import { describe, expect, it } from 'vitest';
import { parseCsv, parseJson } from '../../src/questions/parse';
import { normalizeText } from '../../src/questions/schema';
import { validateRecords } from '../../src/questions/validate';
import { loadBank } from '../helpers/fixtures';

const good = {
  question: '¿Cuál es el planeta más grande del sistema solar?',
  options: ['Júpiter', 'Saturno', 'Neptuno', 'Tierra'],
  answer: 0,
  explanation: 'Júpiter tiene más del doble de masa que todos los demás planetas juntos.',
  category: 'espacio',
  difficulty: 'facil',
};

describe('parseJson', () => {
  it('acepta un arreglo de preguntas', () => {
    expect(parseJson(JSON.stringify([good]), 'a.json')).toHaveLength(1);
  });
  it('aplica valores por defecto del archivo', () => {
    const { category, ...rest } = good;
    const recs = parseJson(JSON.stringify({ category, questions: [rest] }), 'b.json');
    expect(recs[0]!.data.category).toBe('espacio');
  });
  it('lanza un error claro si el JSON es inválido', () => {
    expect(() => parseJson('{', 'c.json')).toThrow(/JSON inválido/);
  });
});

describe('parseCsv', () => {
  it('lee comillas, comas y saltos de línea entre comillas, y respuesta en letra', () => {
    const csv =
      'id,question,option_a,option_b,option_c,option_d,answer,explanation,category,difficulty,source,tags\n' +
      'csv-001,"¿Cuál es el río más largo de Europa, sin contar Rusia?",Danubio,Rin,Volga,Ebro,C,"El Volga mide unos 3.530 km.\nFluye por Rusia.",geografia,media,"Wikipedia: Volga",ríos|europa\n';
    const recs = parseCsv(csv, 'x.csv');
    expect(recs).toHaveLength(1);
    const report = validateRecords(recs);
    expect(report.errors).toEqual([]);
    expect(report.valid[0]!.answerIndex).toBe(2);
    expect(report.valid[0]!.text).toContain('Europa, sin contar');
    expect(report.valid[0]!.tags).toEqual(['ríos', 'europa']);
  });
  it('acepta encabezados en español y separador punto y coma', () => {
    const csv =
      'pregunta;opcion_a;opcion_b;opcion_c;opcion_d;respuesta;explicacion;categoria;dificultad\n' +
      '¿Cuántas patas tiene una araña?;6;8;10;12;1;Todas las arañas tienen ocho patas articuladas.;animales;fácil\n';
    const report = validateRecords(parseCsv(csv, 'y.csv'));
    expect(report.errors).toEqual([]);
    expect(report.valid[0]!.difficulty).toBe('facil');
    expect(report.valid[0]!.id).toMatch(/^anim-[0-9a-f]{10}$/);
  });
});

describe('validateRecords', () => {
  const rec = (data: object, ref = 'r') => ({ ref, data: data as Record<string, unknown> });

  it('acepta una pregunta correcta', () => {
    const r = validateRecords([rec(good)]);
    expect(r.errors).toEqual([]);
    expect(r.valid).toHaveLength(1);
  });
  it('rechaza opciones repetidas, número de opciones incorrecto y respuesta fuera de rango', () => {
    expect(validateRecords([rec({ ...good, options: ['a', 'a', 'b', 'c'] })]).errors[0]!.message).toMatch(/repetidas/);
    expect(validateRecords([rec({ ...good, options: ['a', 'b', 'c'] })]).errors.length).toBeGreaterThan(0);
    expect(validateRecords([rec({ ...good, answer: 4 })]).errors.length).toBeGreaterThan(0);
  });
  it('rechaza categorías y dificultades desconocidas', () => {
    expect(validateRecords([rec({ ...good, category: 'magia' })]).errors[0]!.message).toMatch(/Categoría/);
    expect(validateRecords([rec({ ...good, difficulty: 'extrema' })]).errors[0]!.message).toMatch(/Dificultad/);
  });
  it('rechaza opciones de tipo «todas las anteriores»', () => {
    const r = validateRecords([rec({ ...good, options: ['Júpiter', 'Saturno', 'Marte', 'Todas las anteriores'] })]);
    expect(r.errors[0]!.message).toMatch(/anteriores/);
  });
  it('detecta duplicados exactos aunque cambien mayúsculas, tildes o signos', () => {
    const r = validateRecords([
      rec(good, 'a'),
      rec({ ...good, question: '¿CUAL es el planeta mas grande del sistema solar' }, 'b'),
    ]);
    expect(r.valid).toHaveLength(1);
    expect(r.errors[0]!.message).toMatch(/duplicado/i);
  });
  it('detecta ids duplicados', () => {
    const r = validateRecords([rec({ ...good, id: 'x-1' }), rec({ ...good, id: 'x-1', question: '¿Otra pregunta distinta?' })]);
    expect(r.errors[0]!.message).toMatch(/id duplicado/);
  });
  it('avisa de casi duplicados (mismo dato con otras palabras)', () => {
    const r = validateRecords([
      rec(good, 'a'),
      rec({ ...good, question: '¿Qué planeta es el más grande de todo el sistema solar?' }, 'b'),
    ]);
    expect(r.warnings.some((w) => /Posible duplicado/.test(w.message))).toBe(true);
  });
  it('normalizeText elimina tildes y signos', () => {
    expect(normalizeText('¿Qué  ÉS esto?!')).toBe('que es esto');
  });
});

describe('banco de preguntas incluido', () => {
  it('todas las preguntas del banco pasan la validación y no hay duplicados', () => {
    const bank = loadBank();
    expect(bank.length).toBeGreaterThan(100);
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
    expect(new Set(bank.map((q) => q.normalizedText)).size).toBe(bank.length);
  });
});
