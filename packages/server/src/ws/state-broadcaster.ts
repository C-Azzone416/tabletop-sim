import type { Game, Player, Wire, ServerMessage } from '@tabletop/shared';
import * as wiresDb from '../db/wires.js';
import * as tokensDb from '../db/tokens.js';
import * as candidatesDb from '../db/candidates.js';
import { getGameSockets, sendToPlayer } from './connection-manager.js';

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
