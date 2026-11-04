import Redis from 'ioredis';
import { logger } from './logger';

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
}

export class RealtimeCoordinator {
  private redis: Redis | null = null;
  private mode: 'redis' | 'memory-fallback' = 'memory-fallback';
  private readonly memoryRateBuckets = new Map<string, { count: number; expiresAt: number }>();
  private readonly memoryPresence = new Map<string, Map<string, number>>();

  async connect(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    const allowFallback = process.env.REDIS_OPTIONAL_FALLBACK !== 'false';

    if (!redisUrl) {
      this.mode = 'memory-fallback';
      return;
    }

    const client = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 1200,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    client.on('error', () => {
      // Capturé proprement lors du connect() initial ou repli mémoire
    });

    try {
      await client.connect();
      await client.ping();
      this.redis = client;
      this.mode = 'redis';
      logger.info('Connected to Redis coordinator', { mode: 'redis' });
    } catch {
      try {
        client.disconnect();
      } catch {
        // Ignore disconnect error
      }
      if (!allowFallback) {
        throw new Error(`Impossible de se connecter à Redis (${redisUrl})`);
      }
      this.redis = null;
      this.mode = 'memory-fallback';
      logger.info('Redis unavailable — running with local memory coordinator fallback', {
        mode: 'memory-fallback',
      });
    }
  }

  getMode(): 'redis' | 'memory-fallback' {
    return this.mode;
  }

  async checkRateLimit(
    key: string,
    maxPerWindow: number,
    windowMs = 10_000,
  ): Promise<RateLimitCheck> {
    if (this.redis && this.mode === 'redis') {
      try {
        const redisKey = `cc:rl:${key}`;
        const count = await this.redis.incr(redisKey);
        if (count === 1) {
          await this.redis.pexpire(redisKey, windowMs);
        }
        return {
          allowed: count <= maxPerWindow,
          remaining: Math.max(0, maxPerWindow - count),
        };
      } catch {
        // Fallback transparent en cas de coupure Redis transitoire
      }
    }

    const now = Date.now();
    const existing = this.memoryRateBuckets.get(key);
    if (!existing || now >= existing.expiresAt) {
      this.memoryRateBuckets.set(key, { count: 1, expiresAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, maxPerWindow - 1) };
    }

    existing.count += 1;
    return {
      allowed: existing.count <= maxPerWindow,
      remaining: Math.max(0, maxPerWindow - existing.count),
    };
  }

  async markPresence(roomCode: string, userId: string, online: boolean): Promise<void> {
    const normalized = roomCode.trim().toUpperCase();
    if (this.redis && this.mode === 'redis') {
      try {
        const key = `cc:presence:${normalized}`;
        if (online) {
          await this.redis.hset(key, userId, String(Date.now()));
          await this.redis.expire(key, 3600);
        } else {
          await this.redis.hdel(key, userId);
        }
        return;
      } catch {
        // Repli mémoire
      }
    }

    let roomMap = this.memoryPresence.get(normalized);
    if (!roomMap) {
      roomMap = new Map();
      this.memoryPresence.set(normalized, roomMap);
    }
    if (online) {
      roomMap.set(userId, Date.now());
    } else {
      roomMap.delete(userId);
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
    this.memoryRateBuckets.clear();
    this.memoryPresence.clear();
  }
}
