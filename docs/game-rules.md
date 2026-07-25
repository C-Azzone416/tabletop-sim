# Game Rules

Canonical capture of Caroline's rulings on setup flow and turn structure
(via deep-dingo, 2026-07-22). This is the reference to check before a rules
question round-trips back to Caroline.

## Lobby / ready flow

- Players ready up in the lobby (`waiting` status), not after token placement.
- The captain's Start control enables once every player is ready.
- Leaving the lobby starts the game — there is no separate "setup phase"
  screen between the lobby and the board.

## Opening info-token round

- Once the game starts, every player sees the full board immediately
  (board-first — all racks visible, not just the active placer's).
- Placing the opening info token is the first in-game step, turn-ordered:
  captain places first, then clockwise by seat order.
- Each placement is watched live by all players (broadcast as it happens).
- Normal mission play begins automatically after the last player's
  placement — there is no separate "start active game" trigger message.

## Turn structure

- **One action per turn.** There is no separate interrogate-then-cut
  sequence — the guess itself is the turn action.
- The verbal "is this a 3?" ask some teams use is out-of-band, on the
  team's voice call. It has no in-app representation.
- The in-app turn mechanic is `dual_cut` propose/respond:
  1. On your turn, you select a wire on another player's board and
     propose a guessed value.
  2. You must currently hold a hidden wire matching that value yourself —
     this is validated at propose time (hard reject if not), with the
     completion-time check kept as defense in depth.
  3. The wire's owner confirms or denies:
     - **Confirm** → the cut resolves (matches the normal dual-cut outcome).
     - **Deny** on a blue (numbered) wire → a number token is placed.
     - **Deny** on a yellow wire → a yellow indicator is placed.
     - **Deny** on a red wire → the mission is lost immediately.

## Lives

- Players start with lives = players − 1 (4 players → 3 lives; 2 players →
  1 life). Each wrong guess costs one life; reaching 0 loses the mission.
  Example (4p): 3 → 2 → 1 → 0 = loss.
- The UI displays lives counting DOWN toward 0, matching the physical
  game. Internally the engine tracks an equivalent count-UP detonator
  position toward a max (`detonatorPosition`/`detonatorMax`) — the two
  models are mathematically identical, so this is a display-only
  distinction, not a rule.

## Wire visibility

- A player's own hidden wires are always visible to them; other players'
  hidden wires are redacted.
- **Cut and revealed wires are public, face-up information** — in the
  physical game a cut wire lies face-up on the table, its number visible
  to everyone. The server never redacts a non-hidden wire's value
  regardless of owner, and the client displays it (cut wires with a
  strikethrough treatment, revealed wires plain) rather than an anonymous
  marker. This is central to deduction — don't hide it.

## Solo cut legality

- Solo cut is legal **only** when the player holds every remaining uncut
  wire of that number — either all 4 from the start, or the last 2 after a
  dual cut has already removed the other pair. Holding some-but-not-all is
  illegal, not a lesser/riskier option.
- This is a hard-enforced rejection (engine + UI), the same pattern as the
  propose-time must-hold-value guard on `dual_cut` — not an
  attempt-with-detonator-penalty mechanic. Wrong-guess detonator penalties
  live in `dual_cut` only.
- A legal solo cut always succeeds and cuts every matching wire the player
  holds in one action.

## Turn rotation: auto-skip fully-cut players

- When rotating to the next seat, a player with zero uncut wires remaining
  is skipped automatically — no dead turns waiting on someone with nothing
  left to do.
- A fully-cut player also can't be a dual-cut target, since they have no
  hidden wires to select.

## Continuing play after a win or loss

- After a mission ends (win or loss), the same group keeps playing without
  rebuilding the lobby — no re-joining, no new join code, same seats. The
  captain picks the next mission (default: next-mission-up) from the
  win/loss overlay; a loss also offers retrying the same mission.
- Server-side this reuses the same game row (same id, same joinCode, same
  captain/players) rather than creating a new linked game — the only way to
  keep the join code stable. The prior mission's wires, turns, and
  validation tokens are hard-deleted (not archived) when the next mission
  starts; cross-mission history/recaps are a deliberate future follow-up
  (#163), not supported yet.
- Only the captain can trigger it; everyone else follows automatically once
  they do. The opening info-token placement round runs again — it's part of
  every mission, not a one-time lobby step (see above).
- Each seated player's once-per-mission double-detector usage resets.

## Wire semantics (#190 Phase A — master set, decimals, rack sort)

Verified against the source game's official rulebook (2026-07-25 research,
see #190 comments). This is the data-model layer; yellow/red *gameplay*
resolution (cut-by-color, red instant-loss, auto-reveal) is Phase B.

- **Master tile set, defined once** (`WIRE_MASTER_SET` in `@tabletop/shared`):
  - Blue: values 1–12, **4 copies each** (48 tiles) — the only duplicated
    color. Missions select a subset of values/copies.
  - Yellow: **singletons** 1.1–11.1 (11 tiles).
  - Red: **singletons** 1.5–11.5 (11 tiles).
  - Missions may not invent tiles outside this set.
- **Decimals are sort position only.** Yellow's `.1` and red's `.5` suffix
  exists solely to place the tile in the rack sort. During play, yellow/red
  wires carry **no numeric value** — they are simply "yellow" or "red".
  Nothing in the engine may read a yellow/red decimal as a gameplay quantity;
  only color may ever be compared for a yellow/red resolution.
- **Single interleaved rack sort.** A player's rack is ONE ascending numeric
  sequence across all colors, not grouped by color. Example: `3.5, 4.1, 2, 3,
  4, 6` racks as `2, 3, 3.5, 4, 4.1, 6`.
- **Exact-value matching.** `Wire.value` is a string end-to-end; a guess of
  `4` never matches a `4.1` wire, and solo-cut's all-remaining grouping never
  merges them — there is no integer coercion anywhere in the dealer or
  engine that would collapse a decimal wire onto its blue neighbor.
- **Yellow/red are drawn at random.** A mission's `WireGroup` for yellow/red
  specifies a `count` (how many are dealt), not a fixed list of values —
  which specific tiles land in a game is a random draw at setup.
- **Partial-knowledge "N out of M" draws.** Some missions reveal `M`
  candidate tiles publicly (marked *possible* on the board) but secretly
  deal only `N` of them into play, setting the rest aside unseen —
  deliberate deduction uncertainty. Modeled via `WireGroup.candidatePoolSize`
  (optional; omitted/equal-to-count means full knowledge). No mission config
  currently uses this — the draw mechanic (`drawColorGroup` in
  `wire-dealer.ts`) is built and tested ahead of Phase D's per-mission data.
  The candidate pool (`wire_candidates` table, `WireCandidate[]` on
  `game_started`/`game_state`) is broadcast identically to every player —
  no owner, no dealt/confirmed flag (that would leak the answer). The
  client derives "confirmed in play" by cross-referencing a candidate's
  (color, value) against wires that become visible through normal play.
- **Mission compositions are TODO(#216).** Missions 4–8 are confirmed to use
  the full 48-tile blue set; missions 1–3's blue set and every mission's
  yellow/red counts are pending Caroline's physical Mission cards. Current
  values for anything not confirmed are placeholders, clearly marked in
  `constants.ts` — not real mission balance.

## Yellow and red resolution rules (#190 Phase B)

Builds on the master-set/decimal groundwork above. Blue's dual-cut/solo-cut
behavior is unchanged by this phase.

- **Yellow is cut by color, not number.** The propose/respond/complete
  `dual_cut` flow is unchanged in shape — the asker still targets a wire and
  sends a value — but when the true target wire is yellow, the server
  applies color rules instead of number rules: the must-hold guard checks
  for a hidden yellow (not a matching number), and a correct pairing cuts
  the target plus one yellow from the asker's own tray. On a wrong guess,
  the target gets a `'YELLOW'` indicator (no number revealed) rather than
  its true value — this already worked correctly pre-#190 and needed no
  change.
- **Yellow solo-cut is color-scoped.** Legal only when the player holds
  **all** remaining hidden yellow wires in the game (any values — yellow
  has no in-play numeric identity to group by). Mirrors blue's
  all-remaining-copies solo-cut rule exactly, generalized from a
  value-group to a color-group. Triggered with the `'YELLOW'` sentinel
  (the same one already used for the wrong-guess indicator) as `solo_cut`'s
  value — no wire-protocol shape change.
- **Red is never cut — any cut attempt that resolves to red is an instant
  loss**, unless a saving equipment has been used. This applies to BOTH an
  accepted and a rejected dual-cut response — a hidden red wire must never
  reach `'cut'` status, full stop. The mission is won when every blue and
  yellow is resolved with the reds still standing.
- **Equipment seam.** `checkRedSave(gameId, playerId)` is the single choke
  point every red-hit resolution path calls through. It always returns
  `false` today — no equipment system exists yet (a separate, not-yet-
  designed topic) — but a future save item has exactly one place to plug
  into.
- **All-red-hand auto-reveal at turn-start.** If a player's entire
  remaining hidden hand is red (any numbers) when rotation lands on them,
  the reds reveal all at once — marked `revealed`, not `cut`, no life lost,
  not a player action — and rotation continues past them (same turn-start
  evaluation point as #152's auto-skip, which now naturally applies since
  they have zero hidden wires left after the reveal).

## Legacy mechanic (removed)

An earlier design had a separate interrogation exchange
(`select_opponent_wire` / `answer_wire_question` / `next_turn`) preceding
the cut. This is superseded by the ruling above and has been removed from
both client and server — `dual_cut` replaces that interrogation step.
`solo_cut`, `double_detector`, and `reveal_reds` remain valid turn actions
alongside it; the change is that interrogate-then-cut is gone, not that
`dual_cut` is the only action available.
