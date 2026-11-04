import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@capital-city/shared/session',
        replacement: path.resolve(__dirname, 'packages/shared/src/session.ts'),
      },
      {
        find: '@capital-city/shared',
        replacement: path.resolve(__dirname, 'packages/shared/src/index.ts'),
      },
      {
        find: '@capital-city/board-packs',
        replacement: path.resolve(__dirname, 'board-packs/src/index.ts'),
      },
      {
        find: '@capital-city/game-engine',
        replacement: path.resolve(__dirname, 'packages/game-engine/src/index.ts'),
      },
      {
        find: '@capital-city/ui',
        replacement: path.resolve(__dirname, 'packages/ui/src/index.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: [
      'packages/**/*.test.ts',
      'board-packs/**/*.test.ts',
      'apps/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['packages/game-engine/src/**/*.ts', 'board-packs/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
