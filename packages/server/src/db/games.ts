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

export async function deleteGame(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM games WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
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

export async function updateMission(id: string, mission: number): Promise<Game> {
  const rows = await sql`
    UPDATE games SET mission = ${mission} WHERE id = ${id} RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function updateDetonator(id: string, position: number): Promise<Game> {
  const rows = await sql`
    UPDATE games SET detonator_position = ${position} WHERE id = ${id} RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function setPendingInterrogation(
  id: string,
  askerId: string,
  answererId: string,
  wireId: string,
): Promise<Game> {
  const rows = await sql`
    UPDATE games
    SET pending_interrogation_asker_id = ${askerId},
        pending_interrogation_answerer_id = ${answererId},
        pending_interrogation_wire_id = ${wireId}
    WHERE id = ${id}
    RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function clearPendingInterrogation(id: string): Promise<Game> {
  const rows = await sql`
    UPDATE games
    SET pending_interrogation_asker_id = NULL,
        pending_interrogation_answerer_id = NULL,
        pending_interrogation_wire_id = NULL
    WHERE id = ${id}
    RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function setPendingDualCut(id: string, proposerId: string, wireId: string, guessedValue: string): Promise<Game> {
  const rows = await sql`
    UPDATE games
    SET pending_dual_cut_proposer_id = ${proposerId},
        pending_dual_cut_wire_id = ${wireId},
        pending_dual_cut_guessed_value = ${guessedValue}
    WHERE id = ${id}
      AND pending_dual_cut_wire_id IS NULL
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Dual cut already pending');
  return mapGame(rows[0]);
}

export async function clearPendingDualCut(id: string): Promise<Game> {
  const rows = await sql`
    UPDATE games
    SET pending_dual_cut_proposer_id = NULL,
        pending_dual_cut_wire_id = NULL,
        pending_dual_cut_guessed_value = NULL
    WHERE id = ${id}
    RETURNING *
  `;
  return mapGame(rows[0]);
}

export async function updateDetonatorMax(id: string, max: number): Promise<Game> {
  const rows = await sql`
    UPDATE games SET detonator_max = ${max} WHERE id = ${id} RETURNING *
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
    pendingInterrogationAskerId: row.pending_interrogation_asker_id as string | null,
    pendingInterrogationAnswererId: row.pending_interrogation_answerer_id as string | null,
    pendingInterrogationWireId: row.pending_interrogation_wire_id as string | null,
    pendingDualCutWireId: row.pending_dual_cut_wire_id as string | null,
    pendingDualCutProposerId: row.pending_dual_cut_proposer_id as string | null,
    pendingDualCutGuessedValue: row.pending_dual_cut_guessed_value as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
