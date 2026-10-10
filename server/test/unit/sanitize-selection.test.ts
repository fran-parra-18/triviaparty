import { describe, expect, it } from 'vitest';
import { ROOM_CODE_REGEX } from '@trivia/shared';
import { selectQuestionIds, shuffleOptions } from '../../src/game/selection';
import { nameKey, sanitizeName } from '../../src/security/sanitize';
import { generateRoomCode, generateToken } from '../../src/security/tokens';
import type { QuestionMeta } from '../../src/questions/repository';

describe('sanitizeName', () => {
  it('recorta espacios y colapsa espacios internos', () => {
    expect(sanitizeName('   Ana    María  ')).toBe('Ana María');
  });
  it('elimina marcado HTML y caracteres peligrosos', () => {
    expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert(1)/scrip'); // recortado a 20
    expect(sanitizeName('a"b\'c`d{e}')).toBe('abcde');
  });
  it('elimina caracteres invisibles y de control', () => {
    expect(sanitizeName('Jo​se\u0007')).toBe('Jose');
    expect(sanitizeName('‮abc')).toBe('abc');
  });
  it('rechaza nombres vacíos o sin letras ni números', () => {
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName('​​')).toBeNull();
    expect(sanitizeName('...')).toBeNull();
    expect(sanitizeName(42)).toBeNull();
  });
  it('limita a 20 caracteres sin partir emojis', () => {
    const name = sanitizeName('🎉'.repeat(30));
    expect(Array.from(name!).length).toBe(20);
    expect(sanitizeName('x'.repeat(50))!.length).toBe(20);
  });
  it('acepta tildes, eñes y emojis', () => {
    expect(sanitizeName('Íñigo 🚀')).toBe('Íñigo 🚀');
  });
  it('nameKey ignora mayúsculas, tildes y espacios', () => {
    expect(nameKey('José Luis')).toBe(nameKey('jose luis'));
    expect(nameKey('JOSELUIS')).toBe(nameKey('josé luis'));
  });
});

describe('tokens y códigos', () => {
  it('genera códigos de sala válidos y distintos', () => {
    const codes = new Set(Array.from({ length: 500 }, generateRoomCode));
    for (const c of codes) expect(c).toMatch(ROOM_CODE_REGEX);
    expect(codes.size).toBeGreaterThan(495);
  });
  it('genera tokens largos y únicos', () => {
    const t = generateToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(generateToken()).not.toBe(t);
  });
});

describe('selectQuestionIds', () => {
  const pool: QuestionMeta[] = [];
  const cats = ['historia', 'geografia', 'ciencia'] as const;
  const diffs = ['facil', 'media', 'dificil'] as const;
  for (let i = 0; i < 90; i++) {
    pool.push({ id: `q${String(i).padStart(3, '0')}`, categoryId: cats[i % 3]!, difficulty: diffs[Math.floor(i / 3) % 3]! });
  }
  const base = { count: 10, categories: cats, difficulty: 'mixta' as const, random: true, excludeIds: new Set<string>() };

  it('no repite preguntas', () => {
    for (let k = 0; k < 20; k++) {
      const ids = selectQuestionIds(pool, { ...base, count: 50 });
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(50);
    }
  });
  it('excluye las preguntas ya usadas en la sesión', () => {
    const used = new Set(pool.slice(0, 80).map((q) => q.id));
    const ids = selectQuestionIds(pool, { ...base, count: 20, excludeIds: used });
    expect(ids.length).toBe(10);
    for (const id of ids) expect(used.has(id)).toBe(false);
  });
  it('respeta categorías y dificultad', () => {
    const ids = selectQuestionIds(pool, { ...base, categories: ['geografia'], difficulty: 'dificil' });
    for (const id of ids) {
      const q = pool.find((p) => p.id === id)!;
      expect(q.categoryId).toBe('geografia');
      expect(q.difficulty).toBe('dificil');
    }
  });
  it('mezcla categorías en partidas aleatorias', () => {
    const ids = selectQuestionIds(pool, { ...base, count: 9 });
    const catsUsed = new Set(ids.map((id) => pool.find((p) => p.id === id)!.categoryId));
    expect(catsUsed.size).toBe(3);
  });
  it('dificultad progresiva: de fácil a difícil', () => {
    const order = { facil: 0, media: 1, dificil: 2 };
    const ids = selectQuestionIds(pool, { ...base, count: 12, difficulty: 'progresiva' });
    const levels = ids.map((id) => order[pool.find((p) => p.id === id)!.difficulty]);
    expect(levels).toEqual([...levels].sort());
    expect(levels.filter((l) => l === 0).length).toBe(4);
  });
  it('orden no aleatorio es determinista', () => {
    const a = selectQuestionIds(pool, { ...base, random: false });
    const b = selectQuestionIds(pool, { ...base, random: false });
    expect(a).toEqual(b);
  });
  it('barajar opciones conserva la respuesta correcta', () => {
    for (let k = 0; k < 50; k++) {
      const { options, correctIndex } = shuffleOptions(['a', 'b', 'c', 'd'], 2);
      expect(options[correctIndex]).toBe('c');
      expect([...options].sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});
