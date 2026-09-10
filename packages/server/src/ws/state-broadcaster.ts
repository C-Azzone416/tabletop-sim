import type { Game, Player, Wire, ServerMessage } from '@tabletop/shared';
import type { FlipGameState } from '@tabletop/game-flip';
import * as wiresDb from '../db/wires.js';
import * as tokensDb from '../db/tokens.js';
import * as candidatesDb from '../db/candidates.js';
import * as flipGamesDb from '../db/flip-games.js';
import { toFlipTableView } from './flip-view.js';
import { getGameSockets, sendToPlayer } from './connection-manager.js';

/**
 * #382 — the Flip table, rebuilt from the persisted state blob on every
 * broadcast. Nothing is held in memory, which is what makes reconnect work:
 * a client rejoining mid-round gets the exact table, including an outstanding
 * Flip 3 and any pending Freeze/Flip 3 target choice.
 *
 * Identical for every player. Flip has no hidden state (#358 — design contract
 * C1 does not apply), so there is no buildPlayerView equivalent here;
 * `localPlayerId` tells a client which seat is theirs, never what they may see.
 */
async function broadcastFlipGameState(
  gameId: string,
  game: Game,
  players: Player[],
): Promise<void> {
  const stored = await flipGamesDb.getFlipGameState(gameId);
  // A Flip room that has no persisted state yet (created but not seeded) has
  // nothing to render. Sending a malformed table would be worse than sending
  // nothing — the client keeps whatever it last had rather than crashing on a
  // half-built view.
  if (!stored) return;

  const flip = toFlipTableView(stored as FlipGameState);
  const gameSockets = getGameSockets(gameId);

  for (const [playerId] of gameSockets) {
    const message: ServerMessage = {
      type: 'game_state',
      game,
      players,
      localPlayerId: playerId,
      flip,
    };
    sendToPlayer(gameId, playerId, message);
  }
}

/**
 * Build a player-specific view of the game state.
 * CRITICAL: Redacts wire values for OTHER players' hidden wires.
 * Each player can see their own wire values but not other players' hidden values.
 * This is the hidden information security boundary.
 */
export function buildPlayerView(wires: Wire[], requestingPlayerId: string): Wire[] {
  return wires.map(wire => {
    if (wire.playerId !== requestingPlayerId && wire.status === 'hidden') {
      // #187: color is redacted alongside value — on red-wire missions the
      // color map alone is mission-deciding information.
      return { ...wire, value: null, color: null };
    }
    return wire;
  });
}

/**
 * Send full game state to all players in a game, with per-player redaction.
 */
export async function broadcastGameState(
  gameId: string,
  game: Game,
  players: Player[],
): Promise<void> {
  // #382 — branch BEFORE any wire-game DB call. This used to run
  // getWiresByGameId unconditionally, so a Flip game received a state message
  // full of wire-shaped emptiness and the client sat on the lobby screen
  // forever. Returning early is also what guarantees no wiresDb/tokensDb/
  // candidatesDb query is issued on a Flip path at all.
  if (game.gameType === 'flip') {
    await broadcastFlipGameState(gameId, game, players);
    return;
  }

  const wires = await wiresDb.getWiresByGameId(gameId);
  const infoTokens = await tokensDb.getInfoTokensByGameId(gameId);
  const validationTokens = await tokensDb.getValidationTokensByGameId(gameId);
  // #215 groundwork — broadcast identically to every player, no redaction
  // (a candidate has no owner to redact against). Empty for every mission
  // today; no config uses N-of-M yet.
  const candidates = await candidatesDb.getWireCandidatesByGameId(gameId);

  const gameSockets = getGameSockets(gameId);

  for (const [playerId] of gameSockets) {
    const playerWires = buildPlayerView(wires, playerId);
    const message: ServerMessage = {
      type: 'game_state',
      game,
      players,
      wires: playerWires,
      infoTokens,
      validationTokens,
      localPlayerId: playerId,
      candidates,
    };
    sendToPlayer(gameId, playerId, message);
  }
}
