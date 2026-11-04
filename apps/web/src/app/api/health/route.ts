import { NextResponse } from 'next/server';
import { ENGINE_VERSION } from '@capital-city/game-engine';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'capital-city-web',
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
  });
}
