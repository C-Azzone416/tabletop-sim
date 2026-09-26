import type { Game, Player, ServerMessage } from '@tabletop/shared';
import {
  applySpadesPlayerAction,
  buildPrivateSpadesView,
  runBotTurns,
  seatForSpadesPlayer,
  startSpadesGame,
  type BotDifficulty,
  type SpadesGameState,
  type SpadesPlayerAction,
  type SpadesServerMessage,
  type SpadesSeat,
  type TargetScore,
} from '@tabletop/game-spades';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as spadesGamesDb from '../db/spades-games.js';
import * as connManager from '../ws/connection-manager.js';
import { SpadesDisconnectManager, type SpadesDisconnectRecord } from './disconnect-manager.js';

// Every mutation for one table is serialized. Two nearly-simultaneous card
// clicks can never both read and overwrite the same persisted state.
const roomQueues = new Map<string, Promise<void>>();

function pauseDeadline(gameId: string): string | undefined {
  const pending = presence.getPending(gameId);
  if (pending.length === 0) return undefined;
  return new Date(Math.max(...pending.map((record) => record.takeoverAt))).toISOString();
}

async function inRoomQueue<T>(gameId: string, work: () => Promise<T>): Promise<T> {
  const previous = roomQueues.get(gameId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  roomQueues.set(gameId, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (roomQueues.get(gameId) === tail) roomQueues.delete(gameId);
  }
}

async function loadRoom(gameId: string): Promise<{
  game: Game;
  players: Player[];
  state: SpadesGameState;
}> {
  const [game, players, state] = await Promise.all([
    gamesDb.getGameById(gameId),
    playersDb.getPlayersByGameId(gameId),
    spadesGamesDb.getSpadesGameState(gameId),
  ]);
  if (!game) throw new Error('Game not found');
  if (game.gameType !== 'spades') throw new Error('Not a Spades game');
  if (!state) throw new Error('Spades game has not started');
  return { game, players, state };
}

export async function broadcastPrivateSpadesState(
  gameId: string,
  state: SpadesGameState,
  game?: Game,
  players?: Player[],
  pausedUntil?: string,
): Promise<void> {
  const [resolvedGame, resolvedPlayers] = await Promise.all([
    game ? Promise.resolve(game) : gamesDb.getGameById(gameId),
    players ? Promise.resolve(players) : playersDb.getPlayersByGameId(gameId),
  ]);
  if (!resolvedGame) throw new Error('Game not found');
  const effectivePausedUntil = pausedUntil ?? pauseDeadline(gameId);

  for (const [playerId] of connManager.getGameSockets(gameId)) {
    try {
      const { seat, view } = buildPrivateSpadesView(state, playerId);
      const message: SpadesServerMessage = {
        type: 'spades_state',
        game: resolvedGame,
        players: resolvedPlayers,
        localPlayerId: playerId,
        view,
        viewingSeat: seat,
        ...(effectivePausedUntil ? { pausedUntil: effectivePausedUntil } : {}),
      };
      connManager.sendToPlayer(gameId, playerId, message);
    } catch {
      // A stale/non-seated connection must never receive any player's hand.
    }
  }
}

async function settleBots(gameId: string, initial: SpadesGameState): Promise<SpadesGameState> {
  if (presence.isPaused(gameId)) return initial;
  return runBotTurns(initial, {
    onState: async (state) => {
      await spadesGamesDb.saveSpadesGameState(gameId, state);
      await broadcastPrivateSpadesState(gameId, state);
    },
  });
}

export async function startOnlineSpades(
  gameId: string,
  requestingPlayerId: string,
  targetScore: TargetScore,
  botDifficulties: readonly BotDifficulty[],
): Promise<void> {
  await inRoomQueue(gameId, async () => {
    const [game, players] = await Promise.all([
      gamesDb.getGameById(gameId),
      playersDb.getPlayersByGameId(gameId),
    ]);
    if (!game) throw new Error('Game not found');
    if (game.gameType !== 'spades') throw new Error('Not a Spades game');
    if (game.status !== 'waiting') throw new Error('Game already started');
    if (game.captainId !== requestingPlayerId) throw new Error('Only the captain can start the game');
    if (players.length < 1 || players.length > 4) throw new Error('Spades supports 1 to 4 human players');
    if (!players.every((player) => player.ready)) throw new Error('Not all players are ready');
    if (botDifficulties.length !== 4 - players.length) {
      throw new Error('Choose one difficulty for each computer seat');
    }

    let state = startSpadesGame({
      humans: players.map(({ id, name }) => ({ id, name })),
      botDifficulties,
      targetScore,
    });
    const activeGame = await gamesDb.updateGameStatus(gameId, 'active');
    await spadesGamesDb.saveSpadesGameState(gameId, state);
    await broadcastPrivateSpadesState(gameId, state, activeGame, players);
    state = await settleBots(gameId, state);
    await spadesGamesDb.saveSpadesGameState(gameId, state);
  });
}

export async function applyOnlineSpadesAction(
  gameId: string,
  playerId: string,
  action: SpadesPlayerAction,
): Promise<void> {
  await inRoomQueue(gameId, async () => {
    if (presence.isPaused(gameId)) throw new Error('Game paused while a player reconnects');
    const { game, players, state: current } = await loadRoom(gameId);
    if (game.status !== 'active') throw new Error('Game is not active');

    let state = applySpadesPlayerAction(current, playerId, action);
    await spadesGamesDb.saveSpadesGameState(gameId, state);
    await broadcastPrivateSpadesState(gameId, state, game, players);
    state = await settleBots(gameId, state);
    await spadesGamesDb.saveSpadesGameState(gameId, state);

    if (state.phase === 'finished') {
      const finishedGame = await gamesDb.updateGameStatus(gameId, 'won');
      await broadcastPrivateSpadesState(gameId, state, finishedGame, players);
      presence.clearGame(gameId);
    }
  });
}

export async function sendPrivateSpadesState(gameId: string, playerId: string): Promise<void> {
  const { game, players, state } = await loadRoom(gameId);
  const { seat, view } = buildPrivateSpadesView(state, playerId);
  const pausedUntil = pauseDeadline(gameId);
  const message: SpadesServerMessage = {
    type: 'spades_state',
    game,
    players,
    localPlayerId: playerId,
    view,
    viewingSeat: seat,
    ...(pausedUntil ? { pausedUntil } : {}),
  };
  connManager.sendToPlayer(gameId, playerId, message);
}

async function botTakeover(record: SpadesDisconnectRecord): Promise<void> {
  await inRoomQueue(record.gameId, async () => {
    const { state: current } = await loadRoom(record.gameId);
    const players = current.players.map((player) =>
      player.id === record.playerId
        ? { ...player, isBot: true, difficulty: 'normal' as const }
        : player
    );
    let state: SpadesGameState = { ...current, players };
    await spadesGamesDb.saveSpadesGameState(record.gameId, state);
    await broadcastPrivateSpadesState(record.gameId, state);
    state = await settleBots(record.gameId, state);
    await spadesGamesDb.saveSpadesGameState(record.gameId, state);
    const notice: ServerMessage = { type: 'player_reconnected', playerId: record.playerId };
    connManager.broadcastToGame(record.gameId, notice);
  });
}

const presence = new SpadesDisconnectManager({
  onPause: async (record) => {
    const state = await spadesGamesDb.getSpadesGameState(record.gameId);
    if (state) await broadcastPrivateSpadesState(record.gameId, state);
  },
  onReconnect: async (record) => {
    const state = await spadesGamesDb.getSpadesGameState(record.gameId);
    if (state) await broadcastPrivateSpadesState(record.gameId, state);
  },
  onTakeover: botTakeover,
});

/** Returns true when Spades owns this disconnect instead of the generic leave timer. */
export async function noteOnlineSpadesDisconnect(gameId: string, playerId: string): Promise<boolean> {
  const game = await gamesDb.getGameById(gameId);
  if (!game || game.gameType !== 'spades' || game.status !== 'active') return false;
  const state = await spadesGamesDb.getSpadesGameState(gameId);
  if (!state) return false;
  let seat: SpadesSeat;
  try {
    seat = seatForSpadesPlayer(state, playerId);
  } catch {
    return false;
  }
  presence.disconnect(gameId, playerId, seat);
  return true;
}

export async function noteOnlineSpadesReconnect(gameId: string, playerId: string): Promise<boolean> {
  const game = await gamesDb.getGameById(gameId);
  if (!game || game.gameType !== 'spades' || game.status !== 'active') return false;

  const reconnectedInTime = presence.reconnect(gameId, playerId);
  if (!reconnectedInTime) {
    await inRoomQueue(gameId, async () => {
      const state = await spadesGamesDb.getSpadesGameState(gameId);
      if (!state) return;
      const players = state.players.map((player) =>
        player.id === playerId && player.isBot
          ? { ...player, isBot: false, difficulty: undefined }
          : player
      );
      await spadesGamesDb.saveSpadesGameState(gameId, { ...state, players });
    });
  }
  return true;
}

export function clearOnlineSpadesDisconnect(gameId: string, playerId: string): void {
  presence.clearPlayer(gameId, playerId);
}
