export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentMinRank(): number {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVEL_RANK[raw] ?? LEVEL_RANK.info;
}

export interface LogContext {
  correlationId?: string;
  roomCode?: string;
  gameId?: string;
  actorId?: string;
  commandId?: string;
  [key: string]: unknown;
}

function writeLog(level: LogLevel, msg: string, context?: LogContext): void {
  if (LEVEL_RANK[level] < currentMinRank()) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'capital-city-realtime',
    msg,
    ...(context ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => writeLog('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => writeLog('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => writeLog('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => writeLog('error', msg, ctx),
};
