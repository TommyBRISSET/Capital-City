import http from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { Server as SocketIOServer } from 'socket.io';
import { ENGINE_VERSION, type RngFn } from '@capital-city/game-engine';
import { verifySessionToken } from '@capital-city/shared/session';
import { logger } from './infra/logger';
import { disconnectRealtimePrisma, getRealtimePrisma } from './infra/prisma';
import { RealtimeCoordinator } from './infra/redis-coordinator';
import { GameRepository } from './persistence/game-repository';
import { RoomManager } from './room-manager';

const defaultPort = Number(process.env.REALTIME_PORT || 4000);
const cookieName = process.env.SESSION_COOKIE_NAME || 'cc_session';

function extractCookieValue(
  cookieHeader: string | undefined,
  targetName: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === targetName) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export interface CreateRealtimeServerOptions {
  prisma?: PrismaClient;
  rng?: RngFn;
  disconnectGraceMsOverride?: number;
  rateLimitMaxPer10s?: number;
  sessionSecret?: string;
  corsOrigins?: string[] | '*';
}

export function createRealtimeServer(options?: CreateRealtimeServerOptions) {
  const prisma = options?.prisma ?? getRealtimePrisma();
  const ownsPrisma = !options?.prisma;
  const coordinator = new RealtimeCoordinator();
  const repo = new GameRepository(prisma);

  const allowedOrigins =
    options?.corsOrigins ??
    (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'capital-city-realtime',
          engineVersion: ENGINE_VERSION,
          coordinatorMode: coordinator.getMode(),
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          activeConnections: io.engine.clientsCount,
          coordinatorMode: coordinator.getMode(),
          uptimeSeconds: Math.round(process.uptime()),
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    maxHttpBufferSize: 64 * 1024,
  });

  const roomManager = new RoomManager(io, repo, coordinator, {
    rng: options?.rng,
    disconnectGraceMsOverride: options?.disconnectGraceMsOverride,
    rateLimitMaxPer10s: options?.rateLimitMaxPer10s,
  });

  io.use((socket, next) => {
    const authToken =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : extractCookieValue(socket.handshake.headers.cookie, cookieName);

    const claims = verifySessionToken(authToken, options?.sessionSecret);
    if (!claims) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    socket.data.session = claims;
    next();
  });

  io.on('connection', (socket) => {
    roomManager.registerSocket(socket);
  });

  async function initialize(): Promise<void> {
    await coordinator.connect();
    await roomManager.initialize();
  }

  async function close(): Promise<void> {
    await roomManager.shutdown();
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    await coordinator.close();
    if (ownsPrisma) {
      await disconnectRealtimePrisma();
    }
  }

  return {
    httpServer,
    io,
    repo,
    coordinator,
    roomManager,
    initialize,
    close,
  };
}

export { GameRepository } from './persistence/game-repository';
export { RoomManager } from './room-manager';
export { RealtimeCoordinator } from './infra/redis-coordinator';

if (require.main === module) {
  const server = createRealtimeServer();
  const host = process.env.REALTIME_HOST || '0.0.0.0';
  server
    .initialize()
    .then(() => {
      server.httpServer.listen(defaultPort, host, () => {
        logger.info('Capital City Realtime Server listening', {
          host,
          port: defaultPort,
          engineVersion: ENGINE_VERSION,
          coordinatorMode: server.coordinator.getMode(),
        });
      });

      const handleSignal = () => {
        logger.info('Shutting down Capital City Realtime Server...');
        void server.close().finally(() => process.exit(0));
      };

      process.on('SIGINT', handleSignal);
      process.on('SIGTERM', handleSignal);
    })
    .catch((err) => {
      logger.error('Fatal startup error in Realtime Server', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
