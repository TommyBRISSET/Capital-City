import { describe, expect, it } from 'vitest';
import type { BoardPackId } from '@capital-city/shared';
import {
  ALL_BOARD_PACKS,
  CANONICAL_40_SPACES_ECONOMY,
  buildBoardPack,
  getBoardPack,
} from './index';

describe('Board Packs (Asteria City, Riviera District, Nova Frontier)', () => {
  it('provides all 3 required packs with 40 validated spaces and >= 16 cards per deck', () => {
    expect(ALL_BOARD_PACKS).toHaveLength(3);

    for (const pack of ALL_BOARD_PACKS) {
      expect(pack.spaces).toHaveLength(40);
      expect(pack.eventCards.length).toBeGreaterThanOrEqual(16);
      expect(pack.communityCards.length).toBeGreaterThanOrEqual(16);

      const spaceTypes = pack.spaces.reduce<Record<string, number>>((acc, s) => {
        acc[s.type] = (acc[s.type] ?? 0) + 1;
        return acc;
      }, {});

      expect(spaceTypes['START']).toBe(1);
      expect(spaceTypes['PROPERTY']).toBe(22);
      expect(spaceTypes['TRANSPORT']).toBe(4);
      expect(spaceTypes['UTILITY']).toBe(2);
      expect(spaceTypes['EVENT']).toBe(3);
      expect(spaceTypes['COMMUNITY']).toBe(3);
      expect(spaceTypes['TAX']).toBe(2);
      expect(spaceTypes['JAIL']).toBe(1);
      expect(spaceTypes['PARKING']).toBe(1);
      expect(spaceTypes['GO_TO_JAIL']).toBe(1);
    }
  });

  it('maintains identical balanced economic values across all 3 packs while keeping names distinct', () => {
    const asteria = getBoardPack('asteria-city');
    const riviera = getBoardPack('riviera-district');
    const nova = getBoardPack('nova-frontier');

    for (let i = 0; i < 40; i++) {
      const ref = CANONICAL_40_SPACES_ECONOMY[i]!;
      for (const pack of [asteria, riviera, nova]) {
        const space = pack.spaces[i]!;
        expect(space.index).toBe(i);
        expect(space.type).toBe(ref.type);
        expect(space.groupCode).toBe(ref.groupCode);
        expect(space.price).toBe(ref.price);
        expect(space.houseCost).toBe(ref.houseCost);
        expect(space.mortgageValue).toBe(ref.mortgageValue);
        expect(space.taxAmount).toBe(ref.taxAmount);
        expect(space.rents).toEqual(ref.rents);
      }
    }

    expect(asteria.spaces[39]?.name).toBe('Tour Horizon');
    expect(riviera.spaces[39]?.name).toBe('Villa Azur');
    expect(nova.spaces[39]?.name).toBe('Station Solstice');
  });

  it('rejects invalid pack lookup and incomplete narrative arrays', () => {
    expect(() => getBoardPack('invalid-id' as BoardPackId)).toThrow(/Unknown board pack/);
    const asteria = getBoardPack('asteria-city');
    expect(() =>
      buildBoardPack({
        id: 'asteria-city',
        name: 'Broken',
        subtitle: 'Broken',
        description: 'Broken',
        theme: asteria.theme,
        spaceNarratives: [],
        eventCards: asteria.eventCards,
        communityCards: asteria.communityCards,
      }),
    ).toThrow(/40 space narratives/);
  });
});
