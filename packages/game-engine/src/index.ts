import { DEFAULT_RULESET_CONFIG, type RulesetConfig } from '@capital-city/shared';

export const ENGINE_VERSION = '0.3.0';

export function resolveRuleset(overrides?: Partial<RulesetConfig>): RulesetConfig {
  return {
    ...DEFAULT_RULESET_CONFIG,
    ...overrides,
  };
}

export * from './errors';
export * from './rng';
export * from './ledger';
export * from './rules-helpers';
export * from './engine';
