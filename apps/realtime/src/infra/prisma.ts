import { PrismaClient } from '@prisma/client';

function buildSafePrismaUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.includes('pgbouncer=')) return rawUrl;
  return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}pgbouncer=true`;
}

let sharedPrisma: PrismaClient | null = null;

export function createConfiguredPrismaClient(): PrismaClient {
  const url = buildSafePrismaUrl(process.env.DATABASE_URL);
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

export function getRealtimePrisma(): PrismaClient {
  if (!sharedPrisma) {
    sharedPrisma = createConfiguredPrismaClient();
  }
  return sharedPrisma;
}

export async function disconnectRealtimePrisma(): Promise<void> {
  if (sharedPrisma) {
    await sharedPrisma.$disconnect();
    sharedPrisma = null;
  }
}
