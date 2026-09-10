import { sql } from './client.js';

// #361 — persistence for Flip (epic #358). Deliberately shape-agnostic about
// the engine's state: the whole `FlipGameState` goes in and comes out as an
// opaque JSONB blob, so the engine stays the sole owner of its shape and no
// rule is ever reconstructed from columns here. That is the structural half
// of "the engine stays pure" — this module cannot leak game logic because it
// never looks inside the value it stores.
//
// Typed as `unknown` rather than importing `FlipGameState` on purpose: the
// server package does not depend on @tabletop/game-flip for persistence, only
// the call sites that already hold engine types do. Callers cast at the edge.

export async function saveFlipGameState(gameId: string, state: unknown): Promise<void> {
  await sql`
    INSERT INTO flip_games (game_id, state)
    VALUES (${gameId}, ${JSON.stringify(state)}::jsonb)
    ON CONFLICT (game_id) DO UPDATE SET
      state = EXCLUDED.state,
      updated_at = NOW()
  `;
}

export async function getFlipGameState(gameId: string): Promise<unknown | null> {
  const rows = await sql`
    SELECT state FROM flip_games WHERE game_id = ${gameId}
  `;
  return rows.length > 0 ? rows[0].state : null;
}

/**
 * #365 — where a round's points came from. Mirrors the engine's scoring
 * breakdown; stored, not recomputed, so the scoreboard can never disagree
 * with the engine about a score it already awarded.
 *
 * `total` is the same number as the row's `score` column; it is duplicated
 * here so the blob is self-describing when read on its own.
 */
export interface FlipScoreBreakdown {
  numbersSum: number;
  plusSum: number;
  hasX2: boolean;
  /** 15 or 0. Added after the multiplier and never doubled (#358). */
  flip7Bonus: number;
  total: number;
  busted: boolean;
}

export interface FlipRoundScoreRow {
  gameId: string;
  roundNumber: number;
  playerId: string;
  score: number;
  busted: boolean;
  flip7: boolean;
  /**
   * Null for rounds scored before migration 017. Absence must degrade to
   * showing the plain total, never to hiding the row.
   */
  breakdown: FlipScoreBreakdown | null;
}

/**
 * Records one completed round's scores. Idempotent per (game, round, player)
 * so a retried or replayed round-end write cannot double-count a score —
 * `ON CONFLICT DO UPDATE` rather than `DO NOTHING` so a corrected score still
 * lands, but a duplicate insert never creates a second row.
 */
export async function recordFlipRoundScores(
  gameId: string,
  roundNumber: number,
  scores: readonly {
    playerId: string;
    score: number;
    busted: boolean;
    flip7: boolean;
    breakdown?: FlipScoreBreakdown | null;
  }[],
): Promise<void> {
  for (const entry of scores) {
    const breakdown = entry.breakdown === undefined || entry.breakdown === null
      ? null
      : JSON.stringify(entry.breakdown);
    await sql`
      INSERT INTO flip_round_scores (game_id, round_number, player_id, score, busted, flip7, breakdown)
      VALUES (${gameId}, ${roundNumber}, ${entry.playerId}, ${entry.score}, ${entry.busted}, ${entry.flip7}, ${breakdown}::jsonb)
      ON CONFLICT (game_id, round_number, player_id) DO UPDATE SET
        score = EXCLUDED.score,
        busted = EXCLUDED.busted,
        flip7 = EXCLUDED.flip7,
        breakdown = EXCLUDED.breakdown
    `;
  }
}

export async function getFlipRoundScores(gameId: string): Promise<FlipRoundScoreRow[]> {
  const rows = await sql`
    SELECT * FROM flip_round_scores
    WHERE game_id = ${gameId}
    ORDER BY round_number, player_id
  `;
  return rows.map(row => ({
    gameId: row.game_id as string,
    roundNumber: row.round_number as number,
    playerId: row.player_id as string,
    score: row.score as number,
    busted: row.busted as boolean,
    flip7: row.flip7 as boolean,
    breakdown: (row.breakdown ?? null) as FlipScoreBreakdown | null,
  }));
}
