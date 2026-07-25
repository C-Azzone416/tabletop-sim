import { sql } from './client.js';
import type { WireCandidate, WireColor } from '@tabletop/shared';

// #215/#190 groundwork — partial-knowledge "N out of M" candidate pool.
// See migration 013 and the WireCandidate type for why there's no
// dealt/confirmed column: sending one would leak which candidates are
// actually in play.
export async function createWireCandidate(gameId: string, color: WireColor, value: string): Promise<WireCandidate> {
  const rows = await sql`
    INSERT INTO wire_candidates (game_id, color, value)
    VALUES (${gameId}, ${color}, ${value})
    RETURNING *
  `;
  return mapCandidate(rows[0]);
}

export async function getWireCandidatesByGameId(gameId: string): Promise<WireCandidate[]> {
  const rows = await sql`SELECT * FROM wire_candidates WHERE game_id = ${gameId}`;
  return rows.map(mapCandidate);
}

// #157 — cleared alongside wires/turns/validation tokens before a next
// mission deals fresh candidates onto the same game row.
export async function deleteByGameId(gameId: string): Promise<void> {
  await sql`DELETE FROM wire_candidates WHERE game_id = ${gameId}`;
}

function mapCandidate(row: Record<string, unknown>): WireCandidate {
  return {
    gameId: row.game_id as string,
    color: row.color as WireColor,
    value: row.value as string,
  };
}
