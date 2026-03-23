-- Player profiles: persistent identity across games

CREATE TABLE player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link game players to persistent profiles
ALTER TABLE players ADD COLUMN profile_id UUID REFERENCES player_profiles(id);
