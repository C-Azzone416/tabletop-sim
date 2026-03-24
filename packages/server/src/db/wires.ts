import { sql } from './client.js';
import type { Wire, WireColor, WireStatus } from '@tabletop/shared';

export async function createWire(
  gameId: string,
  playerId: string,
  value: string,
  color: WireColor,
  rackPosition: number,
): Promise<Wire> {
  const rows = await sql`
    INSERT INTO wires (game_id, player_id, value, color, rack_position)
    VALUES (${gameId}, ${playerId}, ${value}, ${color}, ${rackPosition})
    RETURNING *
  `;
  return mapWire(rows[0]);
}

export async function createWiresBatch(
  wires: { gameId: string; playerId: string; value: string; color: WireColor; rackPosition: number }[],
): Promise<Wire[]> {
  const results: Wire[] = [];
  for (const w of wires) {
    results.push(await createWire(w.gameId, w.playerId, w.value, w.color, w.rackPosition));
  }
  return results;
}

export async function getWiresByGameId(gameId: string): Promise<Wire[]> {
  const rows = await sql`
    SELECT * FROM wires WHERE game_id = ${gameId} ORDER BY player_id, rack_position
  `;
  return rows.map(mapWire);
}

export async function getWiresByPlayerId(playerId: string): Promise<Wire[]> {
  const rows = await sql`
    SELECT * FROM wires WHERE player_id = ${playerId} ORDER BY rack_position
  `;
  return rows.map(mapWire);
}

export async function getWireById(id: string): Promise<Wire | null> {
  const rows = await sql`SELECT * FROM wires WHERE id = ${id}`;
  return rows[0] ? mapWire(rows[0]) : null;
}

export async function updateWireStatus(id: string, status: WireStatus): Promise<Wire> {
  const rows = await sql`
    UPDATE wires SET status = ${status} WHERE id = ${id} RETURNING *
  `;
  return mapWire(rows[0]);
}

export async function getWiresByValueAndGame(gameId: string, value: string): Promise<Wire[]> {
  const rows = await sql`
    SELECT * FROM wires WHERE game_id = ${gameId} AND value = ${value}
  `;
  return rows.map(mapWire);
}

function mapWire(row: Record<string, unknown>): Wire {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    playerId: row.player_id as string,
    value: row.value as string | null,
    color: row.color as WireColor,
    rackPosition: row.rack_position as number,
    status: row.status as WireStatus,
  };
}
