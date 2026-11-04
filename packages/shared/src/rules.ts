import { z } from 'zod';

export const DisconnectPolicySchema = z.enum(['PAUSE', 'AUTO_PASS', 'ABANDON']);
export type DisconnectPolicy = z.infer<typeof DisconnectPolicySchema>;

export const RulesetConfigSchema = z.object({
  startingCash: z.number().int().min(500).max(5000).default(1500),
  passStartBonus: z.number().int().min(0).max(1000).default(200),
  exactStartDoubleBonus: z.boolean().default(false),
  freeParkingJackpot: z.boolean().default(false),
  auctionEnabled: z.boolean().default(true),
  auctionMinIncrement: z.number().int().min(1).max(200).default(10),
  auctionTimeoutSeconds: z.number().int().min(5).max(120).default(25),
  mortgageRate: z.number().min(0.25).max(0.75).default(0.5),
  mortgageInterestRate: z.number().min(0).max(0.5).default(0.1),
  buildingSellRate: z.number().min(0.25).max(1).default(0.5),
  maxHousesStock: z.number().int().min(8).max(64).default(32),
  maxHotelsStock: z.number().int().min(4).max(32).default(12),
  jailFine: z.number().int().min(10).max(500).default(50),
  maxJailTurns: z.number().int().min(1).max(5).default(3),
  maxDurationMinutes: z.number().int().min(10).max(300).nullable().default(null),
  disconnectGraceSeconds: z.number().int().min(10).max(600).default(120),
  disconnectPolicy: DisconnectPolicySchema.default('AUTO_PASS'),
  allowHostPause: z.boolean().default(true),
});

export type RulesetConfig = z.infer<typeof RulesetConfigSchema>;

export const DEFAULT_RULESET_CONFIG: RulesetConfig = RulesetConfigSchema.parse({});
