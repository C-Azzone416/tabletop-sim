-- #170 amendment (dingo 03:23, heron 03:39): dev-seeded games must not
-- pollute mission_outcomes. Marks provenance on the game row itself so
-- endGame can skip the outcome upsert for dev-seeded games — NOT keyed off
-- ENABLE_DEV_SEED, which would silence all staging games including real
-- playtests run through that environment.
ALTER TABLE games ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'lobby';
