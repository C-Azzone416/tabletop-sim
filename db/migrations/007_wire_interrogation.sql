-- Track pending wire interrogation during setup phase
ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_interrogation_asker_id UUID REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_interrogation_answerer_id UUID REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_interrogation_wire_id UUID REFERENCES wires(id) ON DELETE SET NULL;
