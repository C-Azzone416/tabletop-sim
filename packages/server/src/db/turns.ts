import { sql } from './client.js';
import type { Turn, ActionType, TurnResult } from '@tabletop/shared';

export async function createTurn(
  gameId: string,
  playerId: string,
  actionType: ActionType,
  targetWireId: string | null,
  guessedValue: string | null,
  targetWireId2: string | null = null,
): Promise<Turn> {
  const rows = await sql`
    INSERT INTO turns (game_id, player_id, action_type, target_wire_id, guessed_value, target_wire_id_2)
    VALUES (${gameId}, ${playerId}, ${actionType}, ${targetWireId}, ${guessedValue}, ${targetWireId2})
    RETURNING *
  `;
  return mapTurn(rows[0]);
}

export async function updateTurnResult(id: string, result: TurnResult): Promise<Turn> {
  const rows = await sql`
    UPDATE turns SET result = ${result} WHERE id = ${id} RETURNING *
  `;
  return mapTurn(rows[0]);
}

export async function getTurnsByGameId(gameId: string): Promise<Turn[]> {
  const rows = await sql`
    SELECT * FROM turns WHERE game_id = ${gameId} ORDER BY created_at
  `;
  return rows.map(mapTurn);
}

// #157 — clears the prior mission's turn log when the same game row starts
// its next mission. Must run before wiresDb.deleteByGameId: turns.target_wire_id
// / target_wire_id_2 reference wires(id) with no ON DELETE clause (unlike
// info_tokens, which cascades), so a wire delete with turns still pointing at
// it would violate the FK constraint.
export async function deleteByGameId(gameId: string): Promise<void> {
  await sql`DELETE FROM turns WHERE game_id = ${gameId}`;
}

function mapTurn(row: Record<string, unknown>): Turn {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    playerId: row.player_id as string,
    actionType: row.action_type as ActionType,
    targetWireId: row.target_wire_id as string | null,
    targetWireId2: row.target_wire_id_2 as string | null,
    guessedValue: row.guessed_value as string | null,
    result: row.result as TurnResult | null,
    createdAt: row.created_at as string,
  };
}
