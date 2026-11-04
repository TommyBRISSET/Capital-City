import type {
  AssetState,
  BoardPackDefinition,
  GameState,
  PlayerRankingEntry,
  PropertyGroupCode,
} from '@capital-city/shared';

export function getGroupSpaceIndices(
  pack: BoardPackDefinition,
  groupCode: PropertyGroupCode,
): number[] {
  return pack.spaces.filter((s) => s.groupCode === groupCode).map((s) => s.index);
}

export function ownsFullGroup(
  state: GameState,
  pack: BoardPackDefinition,
  playerId: string,
  groupCode: PropertyGroupCode,
): boolean {
  const indices = getGroupSpaceIndices(pack, groupCode);
  return (
    indices.length > 0 && indices.every((idx) => state.assets[idx]?.ownerPlayerId === playerId)
  );
}

export function groupHasMortgagedSpace(
  state: GameState,
  pack: BoardPackDefinition,
  groupCode: PropertyGroupCode,
): boolean {
  return getGroupSpaceIndices(pack, groupCode).some((idx) =>
    Boolean(state.assets[idx]?.isMortgaged),
  );
}

export function groupHasAnyBuilding(
  state: GameState,
  pack: BoardPackDefinition,
  groupCode: PropertyGroupCode,
): boolean {
  return getGroupSpaceIndices(pack, groupCode).some((idx) => {
    const a = state.assets[idx];
    return Boolean(a && (a.houseCount > 0 || a.hotelCount > 0));
  });
}

export function getBuildingLevel(asset: AssetState | undefined): number {
  if (!asset) return 0;
  if (asset.hotelCount > 0) return 5;
  return asset.houseCount;
}

export function calculateRent(
  state: GameState,
  pack: BoardPackDefinition,
  spaceIndex: number,
  diceTotal: number,
): number {
  const space = pack.spaces[spaceIndex];
  const asset = state.assets[spaceIndex];
  if (!space || !asset || !asset.ownerPlayerId || asset.isMortgaged) {
    return 0;
  }

  const owner = state.players.find((p) => p.id === asset.ownerPlayerId);
  if (!owner || owner.bankruptcyStatus === 'BANKRUPT') {
    return 0;
  }

  if (space.type === 'PROPERTY') {
    let rent = space.rents[0] ?? 0;
    if (asset.hotelCount > 0) {
      rent = space.rents[5] ?? rent;
    } else if (asset.houseCount > 0) {
      rent = space.rents[asset.houseCount] ?? rent;
    } else if (space.groupCode && ownsFullGroup(state, pack, owner.id, space.groupCode)) {
      rent = rent * 2;
    }
    const mult = state.rentMultiplierOverride ?? 1;
    return rent * mult;
  }

  if (space.type === 'TRANSPORT') {
    const ownedTransports = pack.spaces.filter(
      (s) =>
        s.type === 'TRANSPORT' &&
        state.assets[s.index]?.ownerPlayerId === owner.id &&
        !state.assets[s.index]?.isMortgaged,
    ).length;
    if (ownedTransports <= 0) return 0;
    const base = space.rents[Math.min(ownedTransports, space.rents.length) - 1] ?? 25;
    const mult = state.rentMultiplierOverride ?? 1;
    return base * mult;
  }

  if (space.type === 'UTILITY') {
    if (state.utilityDiceMultiplierOverride !== null) {
      return diceTotal * state.utilityDiceMultiplierOverride;
    }
    const ownedUtilities = pack.spaces.filter(
      (s) =>
        s.type === 'UTILITY' &&
        state.assets[s.index]?.ownerPlayerId === owner.id &&
        !state.assets[s.index]?.isMortgaged,
    ).length;
    if (ownedUtilities <= 0) return 0;
    const mult = ownedUtilities >= 2 ? (space.rents[1] ?? 10) : (space.rents[0] ?? 4);
    return diceTotal * mult;
  }

  return 0;
}

export function canBuildOnSpace(
  state: GameState,
  pack: BoardPackDefinition,
  playerId: string,
  spaceIndex: number,
): { allowed: boolean; reason?: string; cost: number } {
  const space = pack.spaces[spaceIndex];
  const asset = state.assets[spaceIndex];
  if (!space || space.type !== 'PROPERTY' || !space.groupCode || !asset) {
    return { allowed: false, reason: 'Ce terrain ne permet aucune construction.', cost: 0 };
  }
  if (asset.ownerPlayerId !== playerId) {
    return { allowed: false, reason: 'Vous ne possédez pas ce terrain.', cost: space.houseCost };
  }
  if (!ownsFullGroup(state, pack, playerId, space.groupCode)) {
    return {
      allowed: false,
      reason: 'Vous devez posséder le groupe de couleur complet pour construire.',
      cost: space.houseCost,
    };
  }
  if (groupHasMortgagedSpace(state, pack, space.groupCode)) {
    return {
      allowed: false,
      reason: 'Impossible de construire tant qu’un terrain du groupe est hypothéqué.',
      cost: space.houseCost,
    };
  }

  const currentLevel = getBuildingLevel(asset);
  if (currentLevel >= 5) {
    return { allowed: false, reason: 'Ce terrain possède déjà un hôtel.', cost: space.houseCost };
  }

  const groupLevels = getGroupSpaceIndices(pack, space.groupCode).map((idx) =>
    getBuildingLevel(state.assets[idx]),
  );
  const minLevel = Math.min(...groupLevels);
  if (currentLevel > minLevel) {
    return {
      allowed: false,
      reason:
        'Construction équilibrée requise : construisez d’abord sur les terrains moins développés du groupe.',
      cost: space.houseCost,
    };
  }

  if (currentLevel < 4 && state.bankHousesAvailable < 1) {
    return {
      allowed: false,
      reason: 'Rupture de stock : la banque ne dispose plus de maisons disponibles.',
      cost: space.houseCost,
    };
  }
  if (currentLevel === 4 && state.bankHotelsAvailable < 1) {
    return {
      allowed: false,
      reason: 'Rupture de stock : la banque ne dispose plus d’hôtels disponibles.',
      cost: space.houseCost,
    };
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.cash < space.houseCost) {
    return {
      allowed: false,
      reason: `Trésorerie insuffisante (${space.houseCost} Cr requis).`,
      cost: space.houseCost,
    };
  }

  return { allowed: true, cost: space.houseCost };
}

export function canSellBuildingOnSpace(
  state: GameState,
  pack: BoardPackDefinition,
  playerId: string,
  spaceIndex: number,
): { allowed: boolean; reason?: string; refund: number } {
  const space = pack.spaces[spaceIndex];
  const asset = state.assets[spaceIndex];
  const refund = space ? Math.floor(space.houseCost * state.ruleset.buildingSellRate) : 0;

  if (!space || space.type !== 'PROPERTY' || !space.groupCode || !asset) {
    return { allowed: false, reason: 'Terrain non constructible.', refund: 0 };
  }
  if (asset.ownerPlayerId !== playerId) {
    return { allowed: false, reason: 'Vous ne possédez pas ce terrain.', refund };
  }

  const currentLevel = getBuildingLevel(asset);
  if (currentLevel <= 0) {
    return { allowed: false, reason: 'Aucun bâtiment à vendre sur ce terrain.', refund };
  }

  const groupLevels = getGroupSpaceIndices(pack, space.groupCode).map((idx) =>
    getBuildingLevel(state.assets[idx]),
  );
  const maxLevel = Math.max(...groupLevels);
  if (currentLevel < maxLevel) {
    return {
      allowed: false,
      reason:
        'Vente équilibrée requise : vendez d’abord sur les terrains les plus construits du groupe.',
      refund,
    };
  }

  if (currentLevel === 5 && state.bankHousesAvailable < 4) {
    return {
      allowed: false,
      reason: 'La banque n’a pas 4 maisons en stock pour rétrograder cet hôtel.',
      refund,
    };
  }

  return { allowed: true, refund };
}

export function getMortgagePayout(
  state: GameState,
  pack: BoardPackDefinition,
  spaceIndex: number,
): number {
  const space = pack.spaces[spaceIndex];
  if (!space || space.price <= 0) return 0;
  return space.mortgageValue > 0
    ? space.mortgageValue
    : Math.floor(space.price * state.ruleset.mortgageRate);
}

export function getRedeemCost(
  state: GameState,
  pack: BoardPackDefinition,
  spaceIndex: number,
): number {
  const principal = getMortgagePayout(state, pack, spaceIndex);
  return Math.ceil(principal * (1 + state.ruleset.mortgageInterestRate));
}

export function canMortgageSpace(
  state: GameState,
  pack: BoardPackDefinition,
  playerId: string,
  spaceIndex: number,
): { allowed: boolean; reason?: string; payout: number } {
  const space = pack.spaces[spaceIndex];
  const asset = state.assets[spaceIndex];
  const payout = getMortgagePayout(state, pack, spaceIndex);

  if (!space || space.price <= 0 || !asset) {
    return { allowed: false, reason: 'Cet emplacement ne peut pas être hypothéqué.', payout: 0 };
  }
  if (asset.ownerPlayerId !== playerId) {
    return { allowed: false, reason: 'Vous ne possédez pas cet actif.', payout };
  }
  if (asset.isMortgaged) {
    return { allowed: false, reason: 'Cet actif est déjà hypothéqué.', payout };
  }
  if (space.groupCode && groupHasAnyBuilding(state, pack, space.groupCode)) {
    return {
      allowed: false,
      reason: 'Vendez tous les bâtiments du groupe avant d’hypothéquer ce terrain.',
      payout,
    };
  }
  return { allowed: true, payout };
}

export function canRedeemSpace(
  state: GameState,
  pack: BoardPackDefinition,
  playerId: string,
  spaceIndex: number,
): { allowed: boolean; reason?: string; cost: number } {
  const space = pack.spaces[spaceIndex];
  const asset = state.assets[spaceIndex];
  const cost = getRedeemCost(state, pack, spaceIndex);

  if (!space || !asset || asset.ownerPlayerId !== playerId) {
    return { allowed: false, reason: 'Vous ne possédez pas cet actif.', cost };
  }
  if (!asset.isMortgaged) {
    return { allowed: false, reason: 'Cet actif n’est pas hypothéqué.', cost };
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.cash < cost) {
    return { allowed: false, reason: `Trésorerie insuffisante (${cost} Cr requis).`, cost };
  }
  return { allowed: true, cost };
}

export function calculatePlayerNetWorth(
  state: GameState,
  pack: BoardPackDefinition,
  playerId: string,
): { netWorth: number; propertiesCount: number; buildingsCount: number } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.bankruptcyStatus === 'BANKRUPT') {
    return { netWorth: 0, propertiesCount: 0, buildingsCount: 0 };
  }

  let total = player.cash;
  let propertiesCount = 0;
  let buildingsCount = 0;

  for (const space of pack.spaces) {
    const asset = state.assets[space.index];
    if (!asset || asset.ownerPlayerId !== playerId) continue;
    propertiesCount += 1;
    total += asset.isMortgaged ? space.mortgageValue : space.price;
    if (asset.hotelCount > 0) {
      buildingsCount += 5;
      total += Math.floor(5 * space.houseCost * state.ruleset.buildingSellRate);
    } else if (asset.houseCount > 0) {
      buildingsCount += asset.houseCount;
      total += Math.floor(asset.houseCount * space.houseCost * state.ruleset.buildingSellRate);
    }
  }

  return { netWorth: total, propertiesCount, buildingsCount };
}

export function computeStandings(
  state: GameState,
  pack: BoardPackDefinition,
): PlayerRankingEntry[] {
  const entries = state.players.map((p) => {
    const stats = calculatePlayerNetWorth(state, pack, p.id);
    return {
      playerId: p.id,
      displayName: p.displayName,
      tokenId: p.tokenId,
      rank: 0,
      netWorth: stats.netWorth,
      cash: p.cash,
      propertiesCount: stats.propertiesCount,
      buildingsCount: stats.buildingsCount,
      isBankrupt: p.bankruptcyStatus === 'BANKRUPT',
    };
  });

  entries.sort((a, b) => {
    if (a.isBankrupt !== b.isBankrupt) return a.isBankrupt ? 1 : -1;
    if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;
    return b.cash - a.cash;
  });

  return entries.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}
