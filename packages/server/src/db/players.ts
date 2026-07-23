import { sql } from './client.js';
import type { Player } from '@tabletop/shared';

export async function createPlayer(gameId: string, name: string, seatOrder: number, profileId?: string): Promise<Player> {
  const rows = await sql`
    INSERT INTO players (game_id, name, seat_order, profile_id)
    VALUES (${gameId}, ${name}, ${seatOrder}, ${profileId ?? null})
    RETURNING *
  `;
  return mapPlayer(rows[0]);
}

export async function getActivePlayerByProfileId(profileId: string): Promise<Player | null> {
  // #157 fallout (QA-caught): 'won'/'lost' must stay reconnectable — the
  // continue-playing overlay lives in that exact state, and the same-
  // game-row transition means a captain/player reloading, opening a second
  // tab, or reconnecting mid-overlay is still "in" this game, not a stale
  // finished one. Excluding them broke the WS /ws upgrade handler's
  // rejoin lookup for every connection made after the game ended.
  const rows = await sql`
    SELECT p.* FROM players p
    JOIN games g ON g.id = p.game_id
    WHERE p.profile_id = ${profileId}
      AND g.status IN ('waiting', 'setup', 'active', 'won', 'lost')
    ORDER BY p.joined_at DESC
    LIMIT 1
  `;
  return rows[0] ? mapPlayer(rows[0]) : null;
}

export async function getPlayersByGameId(gameId: string): Promise<Player[]> {
  const rows = await sql`
    SELECT * FROM players WHERE game_id = ${gameId} ORDER BY seat_order
  `;
  return rows.map(mapPlayer);
}

export async function getPlayerById(id: string): Promise<Player | null> {
  const rows = await sql`SELECT * FROM players WHERE id = ${id}`;
  return rows[0] ? mapPlayer(rows[0]) : null;
}

export async function markDoubleDetectorUsed(id: string): Promise<Player> {
  const rows = await sql`
    UPDATE players SET double_detector_used = TRUE WHERE id = ${id} RETURNING *
  `;
  return mapPlayer(rows[0]);
}

export async function markPlayerReady(id: string): Promise<Player> {
  const rows = await sql`
    UPDATE players SET ready = TRUE WHERE id = ${id} RETURNING *
  `;
  return mapPlayer(rows[0]);
}

export async function markSetupDone(id: string): Promise<Player> {
  const rows = await sql`
    UPDATE players SET setup_done = TRUE WHERE id = ${id} RETURNING *
  `;
  return mapPlayer(rows[0]);
}

// #157 — double detector is a once-per-mission ability; the same game row
// carrying into its next mission needs every seated player's usage cleared.
export async function resetDoubleDetectorForGame(gameId: string): Promise<void> {
  await sql`UPDATE players SET double_detector_used = FALSE WHERE game_id = ${gameId}`;
}

function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    name: row.name as string,
    seatOrder: row.seat_order as number,
    doubleDetectorUsed: row.double_detector_used as boolean,
    ready: (row.ready as boolean) ?? false,
    setupDone: (row.setup_done as boolean) ?? false,
    joinedAt: row.joined_at as string,
  };
}
