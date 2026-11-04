import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

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

async function waitForPort(host, port, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortListening(host, port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  loadDotEnv();
  const port = Number(process.env.POSTGRES_PORT || 5432);
  const host = '127.0.0.1';

  let daemonProc = null;
  if (!(await isPortListening(host, port))) {
    console.log(`[run-with-db] Port ${port} inactive — starting embedded PostgreSQL daemon...`);
    daemonProc = spawn(process.execPath, [path.join(__dirname, 'pg-daemon.mjs')], {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    });
    const ready = await waitForPort(host, port, 25_000);
    if (!ready) {
      if (daemonProc) daemonProc.kill();
      throw new Error(`PostgreSQL did not become ready on ${host}:${port}`);
    }
  }

  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    if (daemonProc) daemonProc.kill();
    return;
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(npxCmd, [cmd, ...args], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (daemonProc) {
    daemonProc.kill('SIGINT');
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[run-with-db] Error:', err);
  process.exit(1);
});
