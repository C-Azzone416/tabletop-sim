import type {
  BotDifficulty,
  Game,
  Player,
  SpadesGameState,
  SpadesPlayerAction,
  SpadesSeat,
  TargetScore,
} from '@tabletop/shared';
import {
  applySpadesPlayerAction,
  buildPrivateSpadesView,
  runBotTurns,
  seatForSpadesPlayer,
  startSpadesGame,
} from '@tabletop/shared';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as spadesDb from '../db/spades-games.js';
import * as connManager from '../ws/connection-manager.js';
import {
  SpadesDisconnectManager,
  type SpadesDisconnectRecord,
} from './disconnect-manager.js';

const roomQueues = new Map<string, Promise<void>>();

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

function pauseDeadline(gameId: string): string | undefined {
  const pending = presence.getPending(gameId);
  if (pending.length === 0) return undefined;
  return new Date(Math.max(...pending.map((record) => record.takeoverAt))).toISOString();
}

async function roomContext(gameId: string): Promise<{
  game: Game;
  players: Player[];
  state: SpadesGameState;
}> {
  const [game, players, state] = await Promise.all([
    gamesDb.getGameById(gameId),
    playersDb.getPlayersByGameId(gameId),
    spadesDb.getSpadesGame(gameId),
  ]);
  if (!game) throw new Error('Game not found');
  if (game.gameType !== 'spades') throw new Error('This room is not a Spades game');
  if (!state) throw new Error('Spades game has not started');
  return { game, players, state };
}

async function broadcastPrivate(
  gameId: string,
  state: SpadesGameState,
  game?: Game,
  players?: Player[],
): Promise<void> {
  const [resolvedGame, resolvedPlayers] = await Promise.all([
    game ? Promise.resolve(game) : gamesDb.getGameById(gameId),
    players ? Promise.resolve(players) : playersDb.getPlayersByGameId(gameId),
  ]);
  if (!resolvedGame) throw new Error('Game not found');

  const pausedUntil = pauseDeadline(gameId);
  for (const [playerId, socket] of connManager.getGameSockets(gameId)) {
    try {
      const { seat, view } = buildPrivateSpadesView(state, playerId);
      socket.send(JSON.stringify({
        type: 'spades_state',
        game: resolvedGame,
        players: resolvedPlayers,
        view,
        viewingSeat: seat,
        ...(pausedUntil ? { pausedUntil } : {}),
      }));
    } catch {
      // Spectators and stale connections never receive an authoritative hand.
    }
  }
}

async function settleBots(gameId: string, initial: SpadesGameState): Promise<SpadesGameState> {
  if (presence.isPaused(gameId)) return initial;
  return runBotTurns(initial, {
    onState: async (state) => {
      await spadesDb.saveSpadesGame(gameId, state);
      await broadcastPrivate(gameId, state);
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
    if (game.gameType !== 'spades') throw new Error('This room is not a Spades game');
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
    await spadesDb.saveSpadesGame(gameId, state);
    await broadcastPrivate(gameId, state, activeGame, players);
    state = await settleBots(gameId, state);
    await spadesDb.saveSpadesGame(gameId, state);
  });
}

export async function applyOnlineSpadesAction(
  gameId: string,
  playerId: string,
  action: SpadesPlayerAction,
): Promise<void> {
  await inRoomQueue(gameId, async () => {
    if (presence.isPaused(gameId)) throw new Error('Game paused while a player reconnects');
    const { game, players, state: current } = await roomContext(gameId);
    if (game.status !== 'active') throw new Error('Game is not active');

    let state = applySpadesPlayerAction(current, playerId, action);
    await spadesDb.saveSpadesGame(gameId, state);
    await broadcastPrivate(gameId, state, game, players);
    state = await settleBots(gameId, state);
    await spadesDb.saveSpadesGame(gameId, state);

    if (state.phase === 'finished') {
      const finishedGame = await gamesDb.updateGameStatus(gameId, 'won');
      await broadcastPrivate(gameId, state, finishedGame, players);
      presence.clearGame(gameId);
    }
  });
}

export async function sendOnlineSpadesState(gameId: string, playerId: string): Promise<void> {
  const { game, players, state } = await roomContext(gameId);
  const socket = connManager.getPlayerSocket(gameId, playerId);
  if (!socket) return;
  const { seat, view } = buildPrivateSpadesView(state, playerId);
  const pausedUntil = pauseDeadline(gameId);
  socket.send(JSON.stringify({
    type: 'spades_state',
    game,
    players,
    view,
    viewingSeat: seat,
    ...(pausedUntil ? { pausedUntil } : {}),
  }));
}

async function botTakeover(record: SpadesDisconnectRecord): Promise<void> {
  await inRoomQueue(record.gameId, async () => {
    const { state: current } = await roomContext(record.gameId);
    const players = current.players.map((player) =>
      player.id === record.playerId
        ? { ...player, isBot: true, difficulty: 'normal' as const }
        : player
    );
    let state: SpadesGameState = { ...current, players };
    await spadesDb.saveSpadesGame(record.gameId, state);
    await broadcastPrivate(record.gameId, state);
    state = await settleBots(record.gameId, state);
    await spadesDb.saveSpadesGame(record.gameId, state);
  });
}

const presence = new SpadesDisconnectManager({
  onPause: async (record) => {
    const state = await spadesDb.getSpadesGame(record.gameId);
    if (state) await broadcastPrivate(record.gameId, state);
  },
  onReconnect: async (record) => {
    const state = await spadesDb.getSpadesGame(record.gameId);
    if (state) await broadcastPrivate(record.gameId, state);
  },
  onTakeover: botTakeover,
});

export async function noteOnlineSpadesDisconnect(
  gameId: string,
  playerId: string,
): Promise<void> {
  const game = await gamesDb.getGameById(gameId);
  if (!game || game.gameType !== 'spades' || game.status !== 'active') return;
  const state = await spadesDb.getSpadesGame(gameId);
  if (!state) return;
  let seat: SpadesSeat;
  try {
    seat = seatForSpadesPlayer(state, playerId);
  } catch {
    return;
  }
  presence.disconnect(gameId, playerId, seat);
}

export async function noteOnlineSpadesReconnect(
  gameId: string,
  playerId: string,
): Promise<void> {
  const game = await gamesDb.getGameById(gameId);
  if (!game || game.gameType !== 'spades' || game.status !== 'active') return;

  if (!presence.reconnect(gameId, playerId)) {
    await inRoomQueue(gameId, async () => {
      const state = await spadesDb.getSpadesGame(gameId);
      if (!state) return;
      const players = state.players.map((player) =>
        player.id === playerId && player.isBot
          ? { ...player, isBot: false, difficulty: undefined }
          : player
      );
      await spadesDb.saveSpadesGame(gameId, { ...state, players });
    });
  }
  await sendOnlineSpadesState(gameId, playerId);
}
