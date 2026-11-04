import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  cwd: rootDir,
  encoding: 'utf8',
  stdio: 'pipe',
});

if (result.stdout) process.stdout.write(result.stdout);

if (result.status === 0) {
  process.exit(0);
}

const stderr = result.stderr || '';
const prismaClientDir = path.join(rootDir, 'node_modules', '.prisma', 'client');
const existingClientJs = path.join(prismaClientDir, 'index.js');
const existingWindowsDll = path.join(prismaClientDir, 'query_engine-windows.dll.node');

const isWindowsDllLock =
  process.platform === 'win32' &&
  stderr.includes('EPERM') &&
  stderr.includes('query_engine-windows.dll.node') &&
  fs.existsSync(existingClientJs) &&
  fs.existsSync(existingWindowsDll);

if (isWindowsDllLock) {
  for (const entry of fs.readdirSync(prismaClientDir)) {
    if (entry.includes('.tmp')) {
      try {
        fs.unlinkSync(path.join(prismaClientDir, entry));
      } catch {
        // Ignorer si déjà nettoyé
      }
    }
  }
  console.log(
    '[db:generate] Prisma client already generated and active in memory on Windows; reusing existing engine binary.',
  );
  process.exit(0);
}

if (stderr) process.stderr.write(stderr);
process.exit(result.status ?? 1);
