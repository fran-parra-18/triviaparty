import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@trivia/shared';

/** Token secreto de sesión (192 bits, base64url). */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Identificador público (no secreto) para jugadores y partidas. */
export function generateId(prefix = ''): string {
  return prefix + randomBytes(9).toString('base64url');
}

/** Código de sala legible generado con un RNG criptográfico. */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Comparación en tiempo constante para evitar ataques de temporización. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
