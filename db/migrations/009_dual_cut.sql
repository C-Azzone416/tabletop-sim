-- Rename duo_cut → dual_cut columns and add guessed value to pending state
ALTER TABLE games RENAME COLUMN pending_duo_cut_wire_id TO pending_dual_cut_wire_id;
ALTER TABLE games RENAME COLUMN pending_duo_cut_proposer_id TO pending_dual_cut_proposer_id;
ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_dual_cut_guessed_value TEXT;
