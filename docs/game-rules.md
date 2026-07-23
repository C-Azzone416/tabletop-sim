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

## Legacy mechanic (removed)

An earlier design had a separate interrogation exchange
(`select_opponent_wire` / `answer_wire_question` / `next_turn`) preceding
the cut. This is superseded by the ruling above and has been removed from
both client and server — `dual_cut` replaces that interrogation step.
`solo_cut`, `double_detector`, and `reveal_reds` remain valid turn actions
alongside it; the change is that interrogate-then-cut is gone, not that
`dual_cut` is the only action available.
