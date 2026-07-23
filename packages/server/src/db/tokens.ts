import { sql } from './client.js';
import type { InfoToken, ValidationToken, WireColor } from '@tabletop/shared';

export async function createInfoToken(gameId: string, wireId: string, value: string): Promise<InfoToken> {
  const rows = await sql`
    INSERT INTO info_tokens (game_id, wire_id, value)
    VALUES (${gameId}, ${wireId}, ${value})
    RETURNING *
  `;
  return mapInfoToken(rows[0]);
}

export async function getInfoTokensByGameId(gameId: string): Promise<InfoToken[]> {
  const rows = await sql`
    SELECT * FROM info_tokens WHERE game_id = ${gameId}
  `;
  return rows.map(mapInfoToken);
}

export async function createValidationToken(gameId: string, wireValue: string, wireColor: WireColor): Promise<ValidationToken> {
  const rows = await sql`
    INSERT INTO validation_tokens (game_id, wire_value, wire_color)
    VALUES (${gameId}, ${wireValue}, ${wireColor})
    RETURNING *
  `;
  return mapValidationToken(rows[0]);
}

export async function getValidationTokensByGameId(gameId: string): Promise<ValidationToken[]> {
  const rows = await sql`
    SELECT * FROM validation_tokens WHERE game_id = ${gameId}
  `;
  return rows.map(mapValidationToken);
}

// #157 — clears the prior mission's validation tokens when the same game row
// starts its next mission. Unlike info_tokens (cascades via wire_id), these
// key off game_id + wire_value/color with no wire FK, so they need an
// explicit delete rather than falling out of wiresDb.deleteByGameId.
export async function deleteValidationTokensByGameId(gameId: string): Promise<void> {
  await sql`DELETE FROM validation_tokens WHERE game_id = ${gameId}`;
}

function mapInfoToken(row: Record<string, unknown>): InfoToken {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    wireId: row.wire_id as string,
    value: row.value as string,
    placedAt: row.placed_at as string,
  };
}

function mapValidationToken(row: Record<string, unknown>): ValidationToken {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    wireValue: row.wire_value as string,
    wireColor: row.wire_color as WireColor,
    validatedAt: row.validated_at as string,
  };
}
