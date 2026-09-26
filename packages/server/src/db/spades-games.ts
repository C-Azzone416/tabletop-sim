import type { SpadesGameState } from '@tabletop/game-spades';
import { sql } from './client.js';

/**
 * Persists the complete authoritative Spades engine state as an opaque JSONB
 * value. Rules remain owned by @tabletop/game-spades; this adapter never
 * reconstructs cards, bids, tricks, or scores from database columns.
 */
export async function saveSpadesGameState(
  gameId: string,
  state: SpadesGameState,
): Promise<void> {
  await sql`
    INSERT INTO spades_games (game_id, state)
    VALUES (${gameId}, ${JSON.stringify(state)}::jsonb)
    ON CONFLICT (game_id) DO UPDATE SET
      state = EXCLUDED.state,
      updated_at = NOW()
  `;
}

export async function getSpadesGameState(gameId: string): Promise<SpadesGameState | null> {
  const rows = await sql`
    SELECT state FROM spades_games WHERE game_id = ${gameId}
  `;
  if (rows.length === 0) return null;
  const value = rows[0].state;
  return (typeof value === 'string' ? JSON.parse(value) : value) as SpadesGameState;
}

export async function deleteSpadesGameState(gameId: string): Promise<void> {
  await sql`DELETE FROM spades_games WHERE game_id = ${gameId}`;
}
