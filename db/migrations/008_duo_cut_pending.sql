-- Track pending duo cut confirmation during active phase
ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_duo_cut_wire_id UUID REFERENCES wires(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_duo_cut_proposer_id UUID REFERENCES players(id) ON DELETE SET NULL;
