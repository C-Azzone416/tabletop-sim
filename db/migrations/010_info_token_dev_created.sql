-- #172: Reveal All Tokens undo. Dev tooling (/dev/reveal-all-tokens and the
-- seed-near-win backfill) creates real info_tokens rows indistinguishable
-- from gameplay-placed ones, so re-hiding needs provenance: dev-created
-- tokens are removable, gameplay tokens (opening placement, dual-cut deny)
-- never are. Pre-existing rows default to FALSE — reveals made before this
-- migration are not undoable, by design.
ALTER TABLE info_tokens ADD COLUMN IF NOT EXISTS dev_created BOOLEAN NOT NULL DEFAULT FALSE;
