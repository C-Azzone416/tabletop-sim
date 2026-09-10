// #383 — the write side of live Flip play. #382 fixed the read side
// (state-broadcaster.ts now renders a Flip game correctly); this is what
// actually mutates the persisted table when a player hits/freezes/chooses a
// target, so there is something new to broadcast in the first place.
//
// Every handler follows the same shape: load the persisted FlipGameState,
// call the matching pure engine function, persist the result, then reuse
// the EXISTING broadcastGameState (already Flip-aware per #382) rather than
// duplicating a send loop here.

import {
  chooseFlip3Target,
  chooseFreezeTarget,
  freeze,
  hit,
  startRound,
  type FlipGameState,
} from '@tabletop/game-flip';
import * as flipGamesDb from '../db/flip-games.js';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import { broadcastGameState } from './state-broadcaster.js';

async function loadFlipState(gameId: string): Promise<FlipGameState> {
  const stored = await flipGamesDb.getFlipGameState(gameId);
  if (!stored) throw new Error('Flip game not found');
  return stored as FlipGameState;
}

async function persistAndBroadcast(gameId: string, next: FlipGameState): Promise<void> {
  await flipGamesDb.saveFlipGameState(gameId, next);
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  const players = await playersDb.getPlayersByGameId(gameId);
  await broadcastGameState(gameId, game, players);
}

export async function handleFlipStartRound(gameId: string, playerId: string): Promise<void> {
  const state = await loadFlipState(gameId);
  const next = startRound(state, playerId);
  await persistAndBroadcast(gameId, next);
}

export async function handleFlipHit(gameId: string, playerId: string): Promise<void> {
  const state = await loadFlipState(gameId);
  const next = hit(state, playerId);
  await persistAndBroadcast(gameId, next);
}

export async function handleFlipFreeze(gameId: string, playerId: string): Promise<void> {
  const state = await loadFlipState(gameId);
  const next = freeze(state, playerId);
  await persistAndBroadcast(gameId, next);
}

export async function handleFlipChooseFreezeTarget(
  gameId: string,
  playerId: string,
  targetId: string,
): Promise<void> {
  const state = await loadFlipState(gameId);
  const next = chooseFreezeTarget(state, playerId, targetId);
  await persistAndBroadcast(gameId, next);
}

export async function handleFlipChooseFlip3Target(
  gameId: string,
  playerId: string,
  targetId: string,
): Promise<void> {
  const state = await loadFlipState(gameId);
  const next = chooseFlip3Target(state, playerId, targetId);
  await persistAndBroadcast(gameId, next);
}
