export interface SignedSessionClaims {
  userId: string;
  displayName: string;
  exp: number;
}

export type SessionClaims = SignedSessionClaims;
