import { NextResponse } from 'next/server';
import { ALL_BOARD_PACKS } from '@capital-city/board-packs';

export async function GET() {
  return NextResponse.json({
    packs: ALL_BOARD_PACKS.map((p) => ({
      id: p.id,
      name: p.name,
      subtitle: p.subtitle,
      description: p.description,
      spacesCount: p.spaces.length,
      eventCardsCount: p.eventCards.length,
      communityCardsCount: p.communityCards.length,
    })),
  });
}
