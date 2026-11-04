import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, '.data', 'postgres');
const port = Number(process.env.POSTGRES_PORT || 5432);
const host = '127.0.0.1';

function isPortListening(targetHost, targetPort) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(targetPort, targetHost);
  });
}

async function main() {
  if (await isPortListening(host, port)) {
    console.log(`[pg-daemon] PostgreSQL already listening on ${host}:${port}`);
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir);
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'capitalcity') THEN
        CREATE ROLE capitalcity WITH LOGIN SUPERUSER PASSWORD 'capitalcity_dev_pwd';
      END IF;
    END
    $$;
  `);

  const server = new PGLiteSocketServer({
    db,
    port,
    host,
    maxConnections: 16,
  });

  await server.start();
  console.log(`[pg-daemon] Embedded PostgreSQL 16 listening on ${host}:${port} (data: ${dataDir})`);

  const shutdown = async () => {
    try {
      await server.stop();
      await db.close();
    } catch {
      // Ignore cleanup errors on exit
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[pg-daemon] Failed to start embedded PostgreSQL:', err);
  process.exit(1);
});
