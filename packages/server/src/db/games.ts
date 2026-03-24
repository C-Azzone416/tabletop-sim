import { sql } from './client.js';
import type { Game, GameStatus } from '@tabletop/shared';

export async function createGame(joinCode: string, mission: number = 1): Promise<Game> {
  const rows = await sql`
    INSERT INTO games (join_code, mission)
    VALUES (${joinCode}, ${mission})
    RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function getGameById(id: string): Promise<Game | null> {
  const rows = await sql`SELECT * FROM games WHERE id = ${id}`;
  return rows[0] ? mapGame(rows[0]) : null;
}

export async function getGameByJoinCode(joinCode: string): Promise<Game | null> {
  const rows = await sql`SELECT * FROM games WHERE join_code = ${joinCode}`;
  return rows[0] ? mapGame(rows[0]) : null;
}

export async function updateGameStatus(id: string, status: GameStatus): Promise<Game> {
  const rows = await sql`
    UPDATE games SET status = ${status} WHERE id = ${id} RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function updateGameCaptain(id: string, captainId: string): Promise<Game> {
  const rows = await sql`
    UPDATE games SET captain_id = ${captainId} WHERE id = ${id} RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function updateCurrentTurn(id: string, playerId: string | null): Promise<Game> {
  const rows = await sql`
    UPDATE games SET current_turn_player_id = ${playerId} WHERE id = ${id} RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function updateDetonator(id: string, position: number): Promise<Game> {
  const rows = await sql`
    UPDATE games SET detonator_position = ${position} WHERE id = ${id} RETURNING *
  `;
  return mapGame(rows[0]);
}

function mapGame(row: Record<string, unknown>): Game {
  return {
    id: row.id as string,
    mission: row.mission as number,
    status: row.status as GameStatus,
    captainId: row.captain_id as string | null,
    currentTurnPlayerId: row.current_turn_player_id as string | null,
    joinCode: row.join_code as string,
    detonatorPosition: row.detonator_position as number,
    detonatorMax: row.detonator_max as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
