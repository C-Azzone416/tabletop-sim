import type { SpadesGameState } from '@tabletop/shared';
import { sql } from './client.js';

function parseState(value: unknown): SpadesGameState {
  if (typeof value === 'string') return JSON.parse(value) as SpadesGameState;
  return value as SpadesGameState;
}

export async function saveSpadesGame(
  gameId: string,
  state: SpadesGameState,
): Promise<void> {
  const serialized = JSON.stringify(state);
  await sql`
    INSERT INTO spades_games (game_id, state, updated_at)
    VALUES (${gameId}, CAST(${serialized} AS JSONB), NOW())
    ON CONFLICT (game_id)
    DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
  `;
}

export async function getSpadesGame(gameId: string): Promise<SpadesGameState | null> {
  const rows = await sql`
    SELECT state FROM spades_games WHERE game_id = ${gameId}
  `;
  return rows[0] ? parseState(rows[0].state) : null;
}

export async function deleteSpadesGame(gameId: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM spades_games WHERE game_id = ${gameId} RETURNING game_id
  `;
  return rows.length > 0;
}
