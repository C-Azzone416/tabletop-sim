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

## Legacy mechanic (removed)

An earlier design had a separate interrogation exchange
(`select_opponent_wire` / `answer_wire_question` / `next_turn`) preceding
the cut. This is superseded by the ruling above and has been removed from
both client and server — `dual_cut` replaces that interrogation step.
`solo_cut`, `double_detector`, and `reveal_reds` remain valid turn actions
alongside it; the change is that interrogate-then-cut is gone, not that
`dual_cut` is the only action available.
