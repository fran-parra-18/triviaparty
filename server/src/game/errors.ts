import { ERROR_MESSAGES, type ErrorCode } from '@trivia/shared';

export class GameError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'GameError';
  }
}
