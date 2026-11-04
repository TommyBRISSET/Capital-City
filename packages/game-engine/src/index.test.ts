import { describe, expect, it } from 'vitest';
import { isSupportedBoardPack } from '@capital-city/board-packs';
import { ENGINE_VERSION, resolveRuleset } from './index';

describe('foundation socle', () => {
  it('exposes engine version and resolves ruleset overrides deterministically', () => {
    expect(ENGINE_VERSION).toBe('0.3.0');
    const custom = resolveRuleset({ startingCash: 2000, passStartBonus: 250 });
    expect(custom.startingCash).toBe(2000);
    expect(custom.passStartBonus).toBe(250);
    expect(custom.maxHousesStock).toBe(32);
    expect(custom.maxHotelsStock).toBe(12);
  });

  it('recognizes the three required board pack identifiers', () => {
    expect(isSupportedBoardPack('asteria-city')).toBe(true);
    expect(isSupportedBoardPack('riviera-district')).toBe(true);
    expect(isSupportedBoardPack('nova-frontier')).toBe(true);
    expect(isSupportedBoardPack('unknown-pack')).toBe(false);
  });
});
