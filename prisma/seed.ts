import { PrismaClient } from '@prisma/client';
import { ALL_BOARD_PACKS } from '../board-packs/src/index';

const prisma = new PrismaClient();

async function main() {
  for (const pack of ALL_BOARD_PACKS) {
    await prisma.boardPack.upsert({
      where: { id: pack.id },
      update: {
        name: pack.name,
        subtitle: pack.subtitle,
        description: pack.description,
        language: pack.language,
        version: pack.version,
        theme: JSON.parse(JSON.stringify(pack.theme)),
        cardsData: JSON.parse(
          JSON.stringify({
            eventCards: pack.eventCards,
            communityCards: pack.communityCards,
          }),
        ),
      },
      create: {
        id: pack.id,
        name: pack.name,
        subtitle: pack.subtitle,
        description: pack.description,
        language: pack.language,
        version: pack.version,
        theme: JSON.parse(JSON.stringify(pack.theme)),
        cardsData: JSON.parse(
          JSON.stringify({
            eventCards: pack.eventCards,
            communityCards: pack.communityCards,
          }),
        ),
      },
    });

    for (const space of pack.spaces) {
      await prisma.boardSpace.upsert({
        where: {
          boardPackId_spaceIndex: {
            boardPackId: pack.id,
            spaceIndex: space.index,
          },
        },
        update: {
          spaceKey: space.id,
          name: space.name,
          type: space.type,
          groupCode: space.groupCode,
          price: space.price,
          baseRent: space.rents[0] ?? 0,
          rents: space.rents,
          houseCost: space.houseCost,
          mortgageValue: space.mortgageValue,
          taxAmount: space.taxAmount,
          effect: { flavorText: space.flavorText, iconKey: space.iconKey },
        },
        create: {
          boardPackId: pack.id,
          spaceIndex: space.index,
          spaceKey: space.id,
          name: space.name,
          type: space.type,
          groupCode: space.groupCode,
          price: space.price,
          baseRent: space.rents[0] ?? 0,
          rents: space.rents,
          houseCost: space.houseCost,
          mortgageValue: space.mortgageValue,
          taxAmount: space.taxAmount,
          effect: { flavorText: space.flavorText, iconKey: space.iconKey },
        },
      });
    }
  }

  console.log(
    `[seed] Seeded ${ALL_BOARD_PACKS.length} board packs and ${ALL_BOARD_PACKS.length * 40} spaces into PostgreSQL.`,
  );
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
