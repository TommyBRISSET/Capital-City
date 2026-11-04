import { PrismaClient } from '@prisma/client';

function buildSafePrismaUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.includes('pgbouncer=')) return rawUrl;
  return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}pgbouncer=true`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const safeUrl = buildSafePrismaUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(safeUrl ? { datasources: { db: { url: safeUrl } } } : undefined);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
