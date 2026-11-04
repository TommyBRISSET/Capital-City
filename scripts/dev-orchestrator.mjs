import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function isPortListening(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
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
    socket.connect(port, host);
  });
}

async function waitForPort(host, port, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortListening(host, port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function waitForHttpOk(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  loadDotEnv();
  const children = [];
  const pgPort = Number(process.env.POSTGRES_PORT || 5432);
  const realtimePort = Number(process.env.REALTIME_PORT || 4000);
  const webPort = Number(process.env.WEB_PORT || 3000);

  if (!(await isPortListening('127.0.0.1', pgPort))) {
    console.log(`[dev] Starting embedded PostgreSQL on 127.0.0.1:${pgPort}...`);
    const pgChild = spawn(process.execPath, [path.join(__dirname, 'pg-daemon.mjs')], {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    children.push(pgChild);
    await waitForPort('127.0.0.1', pgPort, 25_000);
  }

  const tsxCli = require.resolve('tsx/cli');
  console.log(`[dev] Starting Realtime Socket.IO server on 0.0.0.0:${realtimePort}...`);
  const realtimeChild = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: path.join(rootDir, 'apps', 'realtime'),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(realtimeChild);
  await waitForHttpOk(`http://127.0.0.1:${realtimePort}/health`, 25_000);

  const nextCli = require.resolve('next/dist/bin/next');
  const preferProd =
    process.argv.includes('--prod') &&
    fs.existsSync(path.join(rootDir, 'apps', 'web', '.next', 'BUILD_ID'));
  const nextSubcommand = preferProd ? 'start' : 'dev';
  const nextArgs = preferProd
    ? [nextCli, 'start', '-H', '0.0.0.0', '-p', String(webPort)]
    : [nextCli, 'dev', '--webpack', '-H', '0.0.0.0', '-p', String(webPort)];
  console.log(
    `[dev] Starting Next.js web application (${nextSubcommand}) on 0.0.0.0:${webPort}...`,
  );
  const webChild = spawn(process.execPath, nextArgs, {
    cwd: path.join(rootDir, 'apps', 'web'),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(webChild);
  await waitForHttpOk(`http://127.0.0.1:${webPort}/api/health`, 30_000);
  console.log(`[dev] All Capital City services ready -> http://localhost:${webPort}`);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    for (const proc of children) {
      if (!proc.pid) continue;
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('[dev] Orchestrator failed:', err);
  process.exit(1);
});
