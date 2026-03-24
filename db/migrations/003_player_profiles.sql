-- Player profiles: persistent identity across games

CREATE TABLE player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  avatar TEXT CHECK (avatar IS NULL OR char_length(avatar) <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link game players to persistent profiles
ALTER TABLE players ADD COLUMN profile_id UUID REFERENCES player_profiles(id) ON DELETE SET NULL;
