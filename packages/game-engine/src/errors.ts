export type DomainErrorCode =
  | 'GAME_NOT_ACTIVE'
  | 'GAME_PAUSED'
  | 'NOT_YOUR_TURN'
  | 'INVALID_PHASE'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_BANKRUPT'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_SPACE'
  | 'ALREADY_OWNED'
  | 'NOT_OWNER'
  | 'CANNOT_BUILD'
  | 'CANNOT_SELL_BUILDING'
  | 'CANNOT_MORTGAGE'
  | 'CANNOT_REDEEM'
  | 'AUCTION_ERROR'
  | 'TRADE_ERROR'
  | 'JAIL_ERROR'
  | 'DEBT_ERROR'
  | 'PERMISSION_DENIED'
  | 'TOKEN_ALREADY_TAKEN'
  | 'INVALID_PLAYER_COUNT'
  | 'STALE_STATE'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR';

export class DomainRuleError extends Error {
  public readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainRuleError';
    this.code = code;
  }
}
