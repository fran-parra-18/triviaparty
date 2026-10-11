import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  CATEGORIES,
  DEFAULT_SETTINGS,
  TIME_OPTIONS,
  roomCodeSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@trivia/shared';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { SERVER_ROOT, type AppConfig } from './config';
import { generateId } from './security/tokens';
import type { FinishedGame } from './game/Room';
import { RoomManager } from './game/RoomManager';
import type { QuestionRepository } from './questions/repository';
import {
  createBroadcaster,
  notifyRoomClosed,
  registerSocketHandlers,
  type IoServer,
  type RealtimeOptions,
  type SocketData,
} from './realtime/socketServer';
import { getLanAddresses } from './utils/network';

export interface AppDeps {
  config: AppConfig;
  repository: QuestionRepository;
  prisma?: PrismaClient;
  /** Ruta del cliente compilado. Por defecto ../client/dist. */
  clientDist?: string;
  realtime?: Partial<RealtimeOptions>;
}

export interface TriviaApp {
  httpServer: HttpServer;
  io: IoServer;
  manager: RoomManager;
  close: () => Promise<void>;
}

export function createTriviaApp({ config, repository, prisma, clientDist, realtime }: AppDeps): TriviaApp {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          // Fragmentos de las preguntas de pistas musicales (vistas previas de iTunes).
          mediaSrc: ["'self'", 'https://*.itunes.apple.com', 'https://*.mzstatic.com'],
          // En la red local se usa HTTP: forzar HTTPS rompería la carga desde los teléfonos.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
  const roomLookupLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });
  app.use('/api', apiLimiter);

  const httpServer = createServer(app);
  const io: IoServer = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: { origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false },
      maxHttpBufferSize: 16_000,
      pingInterval: 10_000,
      pingTimeout: 10_000,
    },
  );

  const broadcast = createBroadcaster(io);
  const manager = new RoomManager({
    repository,
    hardMaxPlayers: config.MAX_PLAYERS_HARD_LIMIT,
    maxRooms: config.MAX_ROOMS,
    hostGraceMs: config.HOST_GRACE_MINUTES * 60_000,
    roomIdleMs: config.ROOM_IDLE_MINUTES * 60_000,
    onRoomChange: broadcast,
    onRoomClosed: (room, reason) => notifyRoomClosed(io, room, reason),
    onGameFinished: prisma ? (game) => void saveGame(prisma, game) : undefined,
  });
  manager.startSweeper();
  registerSocketHandlers(io, manager, { trustProxy: config.TRUST_PROXY, ...realtime });

  // ───────────── API HTTP (solo lectura; nunca expone respuestas) ─────────────

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), rooms: manager.size });
  });

  app.get('/api/meta', async (_req, res, next) => {
    try {
      const stats = await repository.stats();
      res.json({
        totalQuestions: stats.total,
        categories: CATEGORIES.map((c) => ({ ...c, counts: stats.byCategory[c.id] })),
        timeOptions: TIME_OPTIONS,
        defaults: DEFAULT_SETTINGS,
        limits: { hardMaxPlayers: config.MAX_PLAYERS_HARD_LIMIT },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/network', (_req, res) => {
    res.json({
      publicUrl: config.PUBLIC_URL || null,
      lanAddresses: getLanAddresses(),
      serverPort: config.PORT,
      mode: config.NODE_ENV,
    });
  });

  app.get('/api/rooms/:code', roomLookupLimiter, (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.code);
    const room = parsed.success ? manager.get(parsed.data) : undefined;
    if (!room || room.closed) {
      res.status(404).json({ exists: false });
      return;
    }
    const inGame = room.phase !== 'lobby' && room.phase !== 'finished';
    res.json({
      exists: true,
      phase: room.phase,
      acceptingPlayers: !inGame || room.settings.allowLateJoin,
      playerCount: room.players.size,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'No encontrado' });
  });

  // ───────────── Cliente compilado (producción) ─────────────

  const distDir = clientDist ?? resolve(SERVER_ROOT, '..', 'client', 'dist');
  if (existsSync(resolve(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text/plain')
        .send('Servidor de Trivia Party activo. En desarrollo abre el cliente de Vite (puerto 5173) o ejecuta "npm run build".');
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[http]', err);
    res.status(500).json({ error: 'Error interno' });
  });

  return {
    httpServer,
    io,
    manager,
    close: async () => {
      manager.stop();
      await new Promise<void>((done) => io.close(() => done()));
      if (httpServer.listening) await new Promise<void>((done) => httpServer.close(() => done()));
    },
  };
}

async function saveGame(prisma: PrismaClient, game: FinishedGame) {
  try {
    await prisma.gameRecord.create({
      data: {
        id: generateId('g_'),
        roomCode: game.roomCode,
        gameNumber: game.gameNumber,
        startedAt: new Date(game.startedAt),
        endedAt: new Date(game.endedAt),
        endedEarly: game.endedEarly,
        questionCount: game.final.questions.length,
        playerCount: game.final.ranking.length,
        settingsJson: JSON.stringify(game.settings),
        resultsJson: JSON.stringify({
          ranking: game.final.ranking.map(({ name, score, rank, correctCount }) => ({ name, score, rank, correctCount })),
          questions: game.final.questions.map(({ text, correctRate }) => ({ text, correctRate })),
        }),
      },
    });
  } catch (err) {
    console.error('[db] no se pudo guardar el historial de la partida', err);
  }
}
