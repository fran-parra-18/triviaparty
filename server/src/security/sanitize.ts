import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@trivia/shared';

/**
 * Limpia un apodo: elimina caracteres de control, de formato invisibles y los usados en marcado,
 * colapsa espacios y recorta a la longitud máxima. Devuelve null si el resultado no es válido.
 * React ya escapa el texto al renderizar; esto es una segunda barrera y evita nombres invisibles.
 */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let name = raw.normalize('NFC');
  // Controles (Cc), formato invisible (Cf: zero-width, bidi overrides), separadores de línea/párrafo.
  name = name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '');
  // Caracteres con significado en HTML o plantillas.
  name = name.replace(/[<>&"'`\\{}]/g, '');
  // Marcas combinantes en exceso ("texto zalgo"): máximo 2 seguidas.
  name = name.replace(/(\p{M}{2})\p{M}+/gu, '$1');
  name = name.replace(/\s+/g, ' ').trim();
  // Recortar por puntos de código, no por unidades UTF-16, para no partir emojis.
  const chars = Array.from(name);
  if (chars.length > NAME_MAX_LENGTH) name = chars.slice(0, NAME_MAX_LENGTH).join('').trim();
  if (Array.from(name).length < NAME_MIN_LENGTH) return null;
  // Debe contener al menos una letra, número o emoji visible.
  if (!/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(name)) return null;
  return name;
}

/** Clave para comparar nombres sin distinguir mayúsculas, tildes ni espacios. */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}
