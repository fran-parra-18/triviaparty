import type { ErrorCode, GamePhase } from './types';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: 'No existe ninguna sala con ese código.',
  ROOM_FULL: 'La sala está completa.',
  ROOM_CLOSED: 'La sala se ha cerrado.',
  NAME_TAKEN: 'Ese nombre ya está en uso en la sala. Prueba con otro.',
  INVALID_NAME: 'El nombre no es válido. Usa entre 1 y 20 caracteres.',
  GAME_IN_PROGRESS: 'La partida ya empezó y el anfitrión no permite nuevas incorporaciones.',
  NOT_ALLOWED: 'No tienes permiso para realizar esta acción.',
  INVALID_PAYLOAD: 'Los datos enviados no son válidos.',
  INVALID_STATE: 'Esta acción no está disponible en este momento.',
  RATE_LIMITED: 'Demasiadas solicitudes. Espera un momento.',
  TOO_LATE: 'El tiempo para responder se terminó.',
  ALREADY_ANSWERED: 'Ya respondiste esta pregunta.',
  NOT_ENOUGH_QUESTIONS: 'No hay suficientes preguntas con esos filtros.',
  NOT_ENOUGH_PLAYERS: 'Aún no hay suficientes jugadores conectados.',
  INVALID_TOKEN: 'Tu sesión ya no es válida.',
  SERVER_FULL: 'El servidor alcanzó el máximo de salas activas. Intenta más tarde.',
  INTERNAL: 'Error interno del servidor.',
};

/** Texto del botón principal de avance según la fase (lo usan el anfitrión y el líder). */
export function nextActionLabel(
  phase: GamePhase,
  progress: { index: number; total: number } | null,
  showResultsAfterEach: boolean,
): string | null {
  const isLast = !!progress && progress.index >= progress.total - 1;
  switch (phase) {
    case 'countdown':
      return 'Saltar cuenta atrás';
    case 'question':
      return 'Cerrar pregunta';
    case 'locked':
      return showResultsAfterEach ? 'Revelar respuesta' : isLast ? 'Ver resultados' : 'Siguiente pregunta';
    case 'reveal':
      return 'Ver clasificación';
    case 'leaderboard':
      return isLast ? '🏆 Ver podio' : 'Siguiente pregunta →';
    default:
      return null;
  }
}
