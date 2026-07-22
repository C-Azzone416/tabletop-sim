import { test } from "@playwright/test";

// ── Test: Multiplayer state sync across 2-4 players (BLOCKED) ─────────────
//
// Testing real cross-player sync needs a second (third, fourth) browser
// context authenticated as one of the OTHER seeded players (Alice/Bob/Carol),
// each with their own profileId + playerName query params
// (see helpers.ts's gameUrl()).
//
// There is no way to obtain those identifiers from any existing endpoint:
//   - GET /games/:joinCode returns players via playersDb.getPlayersByGameId,
//     whose mapPlayer() (packages/server/src/db/players.ts) does not include
//     profile_id in the returned Player shape at all.
//   - Even if it did, Alice/Bob/Carol are joined in /dev/seed via
//     engine.joinGame(joinCode, name) with no profileId argument (see
//     packages/server/src/app.ts), so their player rows have
//     profile_id = null — there is no existing profile to fetch.
//   - Creating a fresh profile via POST /profiles with name "Alice" would
//     authenticate a WS connection (ws/auth.ts only checks profile existence
//     + name match) but would NOT associate with the existing Alice player
//     row, since reconnect matching (getActivePlayerByProfileId) keys off
//     profile_id, which is null for that row. The new socket would connect
//     but never receive "Not connected to a game" state for Alice's actual
//     seat — it would be an authenticated, gameless connection.
//   - Two browser contexts connecting as the SAME profileId (Dev) don't
//     validate real multiplayer sync either: connection-manager.ts's
//     gameConnections is a Map<gameId, Map<playerId, socket>> — a second
//     socket for the same playerId silently overwrites the first entry, so
//     the first tab stops receiving broadcasts (broadcastToGame/sendToPlayer
//     only reach the latest socket per playerId). That would produce a
//     flaky/misleading test, not a real second-player view.
//
// Needs either: /dev/seed creating real profiles for all 4 seeded players
// and returning their profileIds, or a players-list endpoint that exposes
// profileId. Flagging for backend rather than guessing at a workaround.

test.skip("state changes from one player's action are visible to other connected players in real time", () => {});
