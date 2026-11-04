-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'IN_GAME', 'PAUSED', 'FINISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "BankruptcyStatus" AS ENUM ('SOLVENT', 'DEBT_PENDING', 'BANKRUPT');

-- CreateEnum
CREATE TYPE "DeckType" AS ENUM ('EVENT', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "avatar" TEXT NOT NULL DEFAULT 'skyline-tower',
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "theme" JSONB NOT NULL,
    "cardsData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardSpace" (
    "id" TEXT NOT NULL,
    "boardPackId" TEXT NOT NULL,
    "spaceIndex" INTEGER NOT NULL,
    "spaceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "groupCode" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "baseRent" INTEGER NOT NULL DEFAULT 0,
    "rents" JSONB NOT NULL DEFAULT '[]',
    "houseCost" INTEGER NOT NULL DEFAULT 0,
    "mortgageValue" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "effect" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "BoardSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRoom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "hostId" TEXT NOT NULL,
    "boardPackId" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL DEFAULT 'classic',
    "rulesetConfig" JSONB NOT NULL,
    "lobbySlots" JSONB NOT NULL DEFAULT '[]',
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "maxPlayers" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "boardPackId" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPlayerId" TEXT,
    "currentPhase" TEXT NOT NULL DEFAULT 'ROLL_DICE',
    "turnNumber" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stateSnapshot" JSONB NOT NULL,
    "winnerPlayerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "cash" INTEGER NOT NULL DEFAULT 1500,
    "position" INTEGER NOT NULL DEFAULT 0,
    "inJail" BOOLEAN NOT NULL DEFAULT false,
    "jailTurns" INTEGER NOT NULL DEFAULT 0,
    "heldJailCards" INTEGER NOT NULL DEFAULT 0,
    "bankruptcyStatus" "BankruptcyStatus" NOT NULL DEFAULT 'SOLVENT',
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetOwnership" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "spaceIndex" INTEGER NOT NULL,
    "assetId" TEXT NOT NULL,
    "ownerPlayerId" TEXT NOT NULL,
    "isMortgaged" BOOLEAN NOT NULL DEFAULT false,
    "houseCount" INTEGER NOT NULL DEFAULT 0,
    "hotelCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardDeck" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "deckType" "DeckType" NOT NULL,
    "cardId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "effectType" TEXT NOT NULL,
    "effectPayload" JSONB NOT NULL,
    "isHeld" BOOLEAN NOT NULL DEFAULT false,
    "heldByPlayerId" TEXT,

    CONSTRAINT "CardDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "offeredAssets" JSONB NOT NULL DEFAULT '[]',
    "requestedAssets" JSONB NOT NULL DEFAULT '[]',
    "offeredCash" INTEGER NOT NULL DEFAULT 0,
    "requestedCash" INTEGER NOT NULL DEFAULT 0,
    "offeredCards" INTEGER NOT NULL DEFAULT 0,
    "requestedCards" INTEGER NOT NULL DEFAULT 0,
    "cashDelta" INTEGER NOT NULL DEFAULT 0,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSnapshot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "serializedState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedCommand" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "resultVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BoardSpace_boardPackId_spaceIndex_key" ON "BoardSpace"("boardPackId", "spaceIndex");

-- CreateIndex
CREATE UNIQUE INDEX "GameRoom_code_key" ON "GameRoom"("code");

-- CreateIndex
CREATE INDEX "GameRoom_code_idx" ON "GameRoom"("code");

-- CreateIndex
CREATE INDEX "GameRoom_status_idx" ON "GameRoom"("status");

-- CreateIndex
CREATE INDEX "Game_roomId_idx" ON "Game"("roomId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Player_gameId_userId_key" ON "Player"("gameId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_gameId_orderIndex_key" ON "Player"("gameId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AssetOwnership_gameId_spaceIndex_key" ON "AssetOwnership"("gameId", "spaceIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CardDeck_gameId_deckType_cardId_key" ON "CardDeck"("gameId", "deckType", "cardId");

-- CreateIndex
CREATE INDEX "TradeOffer_gameId_status_idx" ON "TradeOffer"("gameId", "status");

-- CreateIndex
CREATE INDEX "GameEvent_gameId_createdAt_idx" ON "GameEvent"("gameId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameEvent_gameId_sequence_key" ON "GameEvent"("gameId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "GameSnapshot_gameId_version_key" ON "GameSnapshot"("gameId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedCommand_gameId_commandId_key" ON "ProcessedCommand"("gameId", "commandId");

-- AddForeignKey
ALTER TABLE "BoardSpace" ADD CONSTRAINT "BoardSpace_boardPackId_fkey" FOREIGN KEY ("boardPackId") REFERENCES "BoardPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_boardPackId_fkey" FOREIGN KEY ("boardPackId") REFERENCES "BoardPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "GameRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_boardPackId_fkey" FOREIGN KEY ("boardPackId") REFERENCES "BoardPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetOwnership" ADD CONSTRAINT "AssetOwnership_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetOwnership" ADD CONSTRAINT "AssetOwnership_ownerPlayerId_fkey" FOREIGN KEY ("ownerPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDeck" ADD CONSTRAINT "CardDeck_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSnapshot" ADD CONSTRAINT "GameSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedCommand" ADD CONSTRAINT "ProcessedCommand_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

