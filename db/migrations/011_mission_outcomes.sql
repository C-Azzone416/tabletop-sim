-- #170: per-profile mission outcome record for home-screen indicators
-- (beaten / tried-failed / unplayed) and, later, #179's beat-to-unlock
-- derivation. One row per (profile, mission) — best outcome only, not
-- row-level game history (per Caroline's direction replacing #163).
CREATE TABLE IF NOT EXISTS mission_outcomes (
  profile_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  mission INT NOT NULL,
  outcome TEXT NOT NULL, -- 'won' | 'lost'; 'won' is never downgraded
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, mission)
);
