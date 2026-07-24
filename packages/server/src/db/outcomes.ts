import { sql } from './client.js';
import type { MissionOutcome, MissionOutcomeResult } from '@tabletop/shared';

// #170 — best-outcome-wins upsert, enforced in SQL so concurrent game-over
// writes can't race a downgrade: a later win permanently upgrades an earlier
// fail; a fail never downgrades a win.
export async function upsertMissionOutcome(profileId: string, mission: number, outcome: MissionOutcomeResult): Promise<void> {
  await sql`
    INSERT INTO mission_outcomes (profile_id, mission, outcome)
    VALUES (${profileId}, ${mission}, ${outcome})
    ON CONFLICT (profile_id, mission) DO UPDATE SET
      outcome = CASE WHEN mission_outcomes.outcome = 'won' THEN 'won' ELSE EXCLUDED.outcome END,
      updated_at = NOW()
  `;
}

export async function getMissionOutcomesByProfileId(profileId: string): Promise<MissionOutcome[]> {
  const rows = await sql`
    SELECT * FROM mission_outcomes WHERE profile_id = ${profileId} ORDER BY mission
  `;
  return rows.map(row => ({
    profileId: row.profile_id as string,
    mission: row.mission as number,
    outcome: row.outcome as MissionOutcomeResult,
    updatedAt: row.updated_at as string,
  }));
}
