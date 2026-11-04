import { z } from 'zod';

export const BoardPackIdSchema = z.enum(['asteria-city', 'riviera-district', 'nova-frontier']);
export type BoardPackId = z.infer<typeof BoardPackIdSchema>;

export const SpaceTypeSchema = z.enum([
  'START',
  'PROPERTY',
  'TRANSPORT',
  'UTILITY',
  'EVENT',
  'COMMUNITY',
  'TAX',
  'JAIL',
  'PARKING',
  'GO_TO_JAIL',
]);
export type SpaceType = z.infer<typeof SpaceTypeSchema>;

export const PropertyGroupCodeSchema = z.enum(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']);
export type PropertyGroupCode = z.infer<typeof PropertyGroupCodeSchema>;

export const CardEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MOVE_TO'),
    targetIndex: z.number().int().min(0).max(39),
    collectStartBonus: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('MOVE_STEPS'),
    steps: z.number().int().min(-39).max(39),
  }),
  z.object({
    type: z.literal('COLLECT_FROM_BANK'),
    amount: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('PAY_BANK'),
    amount: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('COLLECT_FROM_EACH'),
    amountPerPlayer: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('PAY_EACH'),
    amountPerPlayer: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('REPAIR_BUILDINGS'),
    perHouse: z.number().int().nonnegative(),
    perHotel: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('GET_OUT_OF_JAIL'),
  }),
  z.object({
    type: z.literal('GO_TO_JAIL'),
  }),
  z.object({
    type: z.literal('MOVE_TO_NEAREST_TRANSPORT'),
    rentMultiplier: z.number().int().min(1).max(4).default(2),
  }),
  z.object({
    type: z.literal('MOVE_TO_NEAREST_UTILITY'),
    diceMultiplier: z.number().int().min(1).max(20).default(10),
  }),
]);

export type CardEffect = z.infer<typeof CardEffectSchema>;

export const DeckTypeSchema = z.enum(['EVENT', 'COMMUNITY']);
export type DeckType = z.infer<typeof DeckTypeSchema>;

export const BoardCardDefinitionSchema = z.object({
  id: z.string().min(1),
  deckType: DeckTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  illustrationKey: z.string().min(1),
  effect: CardEffectSchema,
});
export type BoardCardDefinition = z.infer<typeof BoardCardDefinitionSchema>;

export const BoardSpaceDefinitionSchema = z.object({
  index: z.number().int().min(0).max(39),
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  type: SpaceTypeSchema,
  groupCode: PropertyGroupCodeSchema.nullable(),
  price: z.number().int().nonnegative(),
  rents: z.array(z.number().int().nonnegative()),
  houseCost: z.number().int().nonnegative(),
  mortgageValue: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  flavorText: z.string(),
  iconKey: z.string().min(1),
});
export type BoardSpaceDefinition = z.infer<typeof BoardSpaceDefinitionSchema>;

export const GroupThemeSchema = z.object({
  name: z.string(),
  bg: z.string(),
  border: z.string(),
  text: z.string(),
});
export type GroupTheme = z.infer<typeof GroupThemeSchema>;

export const BoardThemeSchema = z.object({
  id: BoardPackIdSchema,
  tagline: z.string(),
  atmosphere: z.string(),
  surfaceBg: z.string(),
  boardSurface: z.string(),
  boardCenterGradient: z.string(),
  accentPrimary: z.string(),
  accentSecondary: z.string(),
  cellBg: z.string(),
  cellBorder: z.string(),
  currencyLabel: z.string(),
  eventDeckName: z.string(),
  communityDeckName: z.string(),
  groups: z.record(PropertyGroupCodeSchema, GroupThemeSchema),
});
export type BoardTheme = z.infer<typeof BoardThemeSchema>;

export const BoardPackDefinitionSchema = z.object({
  id: BoardPackIdSchema,
  name: z.string().min(1),
  subtitle: z.string().min(1),
  description: z.string().min(1),
  version: z.string().default('1.0.0'),
  language: z.string().default('fr'),
  theme: BoardThemeSchema,
  spaces: z.array(BoardSpaceDefinitionSchema).length(40),
  eventCards: z.array(BoardCardDefinitionSchema).min(16),
  communityCards: z.array(BoardCardDefinitionSchema).min(16),
});
export type BoardPackDefinition = z.infer<typeof BoardPackDefinitionSchema>;
