import {
  BoardPackDefinitionSchema,
  type BoardPackDefinition,
  type BoardPackId,
} from '@capital-city/shared';
import { asteriaCityPack } from './asteria-city';
import { rivieraDistrictPack } from './riviera-district';
import { novaFrontierPack } from './nova-frontier';

export * from './economy';
export { asteriaCityPack, rivieraDistrictPack, novaFrontierPack };

export const AVAILABLE_BOARD_PACK_IDS: readonly BoardPackId[] = [
  'asteria-city',
  'riviera-district',
  'nova-frontier',
] as const;

export const BOARD_PACKS_BY_ID: Record<BoardPackId, BoardPackDefinition> = {
  'asteria-city': BoardPackDefinitionSchema.parse(asteriaCityPack),
  'riviera-district': BoardPackDefinitionSchema.parse(rivieraDistrictPack),
  'nova-frontier': BoardPackDefinitionSchema.parse(novaFrontierPack),
};

export const ALL_BOARD_PACKS: readonly BoardPackDefinition[] = [
  BOARD_PACKS_BY_ID['asteria-city'],
  BOARD_PACKS_BY_ID['riviera-district'],
  BOARD_PACKS_BY_ID['nova-frontier'],
];

export function isSupportedBoardPack(id: string): id is BoardPackId {
  return (AVAILABLE_BOARD_PACK_IDS as readonly string[]).includes(id);
}

export function getBoardPack(id: BoardPackId): BoardPackDefinition {
  const pack = BOARD_PACKS_BY_ID[id];
  if (!pack) {
    throw new Error(`Unknown board pack: ${id}`);
  }
  return pack;
}
