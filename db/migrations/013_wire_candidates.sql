-- #215 groundwork: partial-knowledge "N out of M" wire draws (#190 rulebook
-- research). A candidate is a publicly-known value revealed at setup, not a
-- physical tile assigned to a player — some of the M candidates never
-- become a real dealt wire (set aside unseen), so they can't live in
-- `wires`. No mission config uses N-of-M yet; this starts empty in every
-- current game. Deliberately no `dealt`/`is_dealt` column — see the #215
-- contract comment: sending that would leak which candidates are
-- confirmed in play, killing the deduction mechanic. The client derives
-- "confirmed" itself by cross-referencing a candidate's (color, value)
-- against normal wire reveals.
CREATE TABLE IF NOT EXISTS wire_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  value TEXT NOT NULL
);
