import { sql } from './client.js';
import type { Player } from '@tabletop/shared';

export async function createPlayer(gameId: string, name: string, seatOrder: number): Promise<Player> {
  const rows = await sql`
    INSERT INTO players (game_id, name, seat_order)
    VALUES (${gameId}, ${name}, ${seatOrder})
    RETURNING *
  `;
  return mapPlayer(rows[0]);
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

function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    name: row.name as string,
    seatOrder: row.seat_order as number,
    doubleDetectorUsed: row.double_detector_used as boolean,
    joinedAt: row.joined_at as string,
  };
}
