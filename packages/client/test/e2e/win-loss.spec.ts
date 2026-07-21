import { test } from "@playwright/test";

// ── Tests: Mission win / loss conditions (BLOCKED) ─────────────────────────
//
// Both require driving the game to a terminal state that isn't reachable
// with the tools currently available to E2E tests:
//
// WIN (checkWinCondition in packages/server/src/engine/game-engine.ts)
// requires EVERY wire across ALL 4 players to be "cut". Solo Cut only cuts
// the ACTING player's own wires; cutting another player's wires requires a
// completed Dual Cut, which needs that wire's owner to respond via their own
// WebSocket session (respond_dual_cut). /dev/seed only returns a usable
// profileId for "Dev" — Alice/Bob/Carol are joined via
// engine.joinGame(joinCode, name) with no profileId (see
// packages/server/src/app.ts's /dev/seed handler), so their player rows have
// profile_id = null and there is no way to authenticate a WS connection as
// them (packages/server/src/ws/auth.ts requires a real profile whose name
// matches). With only one controllable identity, a full mission cannot be
// completed through legitimate play. Would need either a dev endpoint that
// seeds a near-won board (e.g. 1-2 wires left) or a way to drive the other 3
// seeded players.
//
// LOSS (game status → "lost") in an ACTIVE game happens when the detonator
// hits detonatorMax, which only occurs via: a failed Solo Cut (structurally
// unreachable via the current UI — see wire-cutting.spec.ts's skipped
// "wrong/no-match" test), a failed Dual Cut (blocked for the same
// other-player-identity reason as WIN above), or a wrong interrogation
// answer on a red wire during the SETUP phase (needs /dev/seed-setup, which
// is not implemented yet per setup-flow.spec.ts). None of these paths are
// currently triggerable from a single-identity E2E test against /dev/seed +
// /dev/advance-turn alone.
//
// Flagging both for backend/product rather than guessing at a fake
// implementation — see final report for the analysis behind this.

test.skip("mission win condition: all safe wires cleared shows Mission Complete overlay", () => {});
test.skip("mission loss condition: detonator hits max shows Mission Failed overlay", () => {});
