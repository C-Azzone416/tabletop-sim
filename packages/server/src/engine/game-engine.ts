import { randomInt } from 'node:crypto';
import { MISSION_CONFIGS } from '@tabletop/shared';
import type { Game, Player, Wire, Turn, WireColor } from '@tabletop/shared';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as wiresDb from '../db/wires.js';
import * as tokensDb from '../db/tokens.js';
import * as turnsDb from '../db/turns.js';
import { dealWires } from './wire-dealer.js';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

export async function createGame(playerName: string, profileId?: string): Promise<{ game: Game; player: Player }> {
  const joinCode = generateJoinCode();
  const game = await gamesDb.createGame(joinCode);
  const player = await playersDb.createPlayer(game.id, playerName, 0, profileId);
  const updatedGame = await gamesDb.updateGameCaptain(game.id, player.id);
  return { game: updatedGame, player };
}

export async function joinGame(joinCode: string, playerName: string, profileId?: string): Promise<{ game: Game; player: Player; players: Player[] }> {
  const game = await gamesDb.getGameByJoinCode(joinCode);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'waiting') throw new Error('Game already started');

  const existingPlayers = await playersDb.getPlayersByGameId(game.id);
  if (existingPlayers.length >= 4) throw new Error('Game is full');

  const player = await playersDb.createPlayer(game.id, playerName, existingPlayers.length, profileId);
  const players = await playersDb.getPlayersByGameId(game.id);
  return { game, player, players };
}

export async function startGame(gameId: string, requestingPlayerId: string, mission: number = 1): Promise<{ game: Game; players: Player[]; wires: Wire[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'waiting') throw new Error('Game already started');
  if (game.captainId !== requestingPlayerId) throw new Error('Only the captain can start the game');

  const players = await playersDb.getPlayersByGameId(gameId);
  if (players.length < 1) throw new Error('Need at least 1 player');

  const missionConfig = MISSION_CONFIGS[mission];
  if (!missionConfig) throw new Error('Invalid mission');

  // For solo testing, fall back to the 2-player detonator when player count has no config entry
  const detonatorMax = missionConfig.detonator[players.length] ?? missionConfig.detonator[2];
  if (!detonatorMax) throw new Error('Invalid player count');

  // Store the selected mission
  await gamesDb.updateMission(gameId, mission);

  // Deal wires for the selected mission
  const playerIds = players.map(p => p.id);
  const dealedWires = dealWires(playerIds, game.captainId!, mission);

  const createdWires: Wire[] = [];
  for (const dw of dealedWires) {
    const wire = await wiresDb.createWire(gameId, dw.playerId, dw.value, dw.color, dw.rackPosition);
    createdWires.push(wire);
  }

  // Update game to setup phase
  await gamesDb.updateDetonator(gameId, 0);
  const updatedGame = await gamesDb.updateGameStatus(gameId, 'setup');

  return { game: { ...updatedGame, detonatorMax }, players, wires: createdWires };
}

export async function executePlaceInfoToken(
  gameId: string,
  playerId: string,
  wireId: string,
): Promise<{ infoToken: import('@tabletop/shared').InfoToken }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');

  const wire = await wiresDb.getWireById(wireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId !== playerId) throw new Error('Can only place info token on your own wire');
  if (wire.status !== 'hidden') throw new Error('Wire already cut or revealed');

  const infoToken = await tokensDb.createInfoToken(gameId, wireId, wire.value!);
  return { infoToken };
}

export async function executeCompleteSetup(
  gameId: string,
  playerId: string,
): Promise<{ game: Game; players: Player[]; allDone: boolean }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');

  await playersDb.markSetupDone(playerId);
  const players = await playersDb.getPlayersByGameId(gameId);
  const allDone = players.every(p => p.setupDone);

  if (allDone) {
    const captain = players.find(p => p.id === game.captainId);
    if (!captain) throw new Error('Captain not found');
    await gamesDb.updateCurrentTurn(gameId, captain.id);
    const activeGame = await gamesDb.updateGameStatus(gameId, 'active');
    return { game: activeGame, players, allDone: true };
  }

  return { game, players, allDone: false };
}

export async function completeSetup(gameId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');

  const players = await playersDb.getPlayersByGameId(gameId);
  // Captain goes first
  const captain = players.find(p => p.id === game.captainId);
  if (!captain) throw new Error('Captain not found');

  await gamesDb.updateCurrentTurn(gameId, captain.id);
  return await gamesDb.updateGameStatus(gameId, 'active');
}

export async function executeDuoCut(
  gameId: string,
  playerId: string,
  targetWireId: string,
  guessedValue: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await validateTurn(gameId, playerId);
  const wire = await wiresDb.getWireById(targetWireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId === playerId) throw new Error('Cannot cut your own wire with duo cut');
  if (wire.status !== 'hidden') throw new Error('Wire already cut or revealed');

  const turn = await turnsDb.createTurn(gameId, playerId, 'duo_cut', targetWireId, guessedValue);

  const isCorrect = wire.value === guessedValue;
  const updatedWire = await wiresDb.updateWireStatus(targetWireId, 'cut');
  const updatedWires = [updatedWire];

  let updatedGame: Game;
  if (isCorrect) {
    await turnsDb.updateTurnResult(turn.id, 'success');
    updatedGame = game;
  } else {
    await turnsDb.updateTurnResult(turn.id, 'fail');
    // Place info token on the wire
    await tokensDb.createInfoToken(gameId, targetWireId, wire.value!);
    // Advance detonator
    const newPosition = game.detonatorPosition + 1;
    updatedGame = await gamesDb.updateDetonator(gameId, newPosition);

    if (newPosition >= game.detonatorMax) {
      updatedGame = await gamesDb.updateGameStatus(gameId, 'lost');
      return { turn: { ...turn, result: 'fail' }, game: updatedGame, updatedWires };
    }
  }

  // Check for validation (all 4 of a color+value cut)
  await checkValidation(gameId, wire.value!, wire.color);

  // Check win condition
  const winResult = await checkWinCondition(gameId);
  if (winResult) {
    updatedGame = await gamesDb.updateGameStatus(gameId, 'won');
  } else {
    updatedGame = await advanceTurn(gameId);
  }

  return { turn: { ...turn, result: isCorrect ? 'success' : 'fail' }, game: updatedGame, updatedWires };
}

export async function executeSoloCut(
  gameId: string,
  playerId: string,
  wireValue: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await validateTurn(gameId, playerId);

  // Find all of the player's hidden wires with the guessed value
  const playerWires = await wiresDb.getWiresByPlayerId(playerId);
  const matchingWires = playerWires.filter(w => w.status === 'hidden' && w.value === wireValue);

  const turn = await turnsDb.createTurn(gameId, playerId, 'solo_cut', null, wireValue);

  const updatedWires: Wire[] = [];

  if (matchingWires.length > 0) {
    // Cut all matching wires
    for (const w of matchingWires) {
      const updated = await wiresDb.updateWireStatus(w.id, 'cut');
      updatedWires.push(updated);
    }
    await turnsDb.updateTurnResult(turn.id, 'success');
  } else {
    // Fail — advance detonator
    await turnsDb.updateTurnResult(turn.id, 'fail');
    const newPosition = game.detonatorPosition + 1;
    const updatedGame = await gamesDb.updateDetonator(gameId, newPosition);

    if (newPosition >= game.detonatorMax) {
      const lostGame = await gamesDb.updateGameStatus(gameId, 'lost');
      return { turn: { ...turn, result: 'fail' }, game: lostGame, updatedWires };
    }
  }

  // Check validation per color for any cut wires
  const cutColors = new Set(matchingWires.map(w => w.color));
  for (const color of cutColors) {
    await checkValidation(gameId, wireValue, color);
  }

  // Check win
  const game2 = await gamesDb.getGameById(gameId);
  const winResult = await checkWinCondition(gameId);
  if (winResult) {
    const wonGame = await gamesDb.updateGameStatus(gameId, 'won');
    return { turn: { ...turn, result: matchingWires.length > 0 ? 'success' : 'fail' }, game: wonGame, updatedWires };
  }

  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: matchingWires.length > 0 ? 'success' : 'fail' }, game: advancedGame, updatedWires };
}

export async function executeDoubleDetector(
  gameId: string,
  playerId: string,
  targetWireId1: string,
  targetWireId2: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await validateTurn(gameId, playerId);

  const player = await playersDb.getPlayerById(playerId);
  if (!player) throw new Error('Player not found');
  if (player.doubleDetectorUsed) throw new Error('Double detector already used');

  const wire1 = await wiresDb.getWireById(targetWireId1);
  const wire2 = await wiresDb.getWireById(targetWireId2);
  if (!wire1 || !wire2) throw new Error('Wire not found');
  if (wire1.playerId !== playerId || wire2.playerId !== playerId) {
    throw new Error('Double detector can only target your own wires');
  }
  if (wire1.status !== 'hidden' || wire2.status !== 'hidden') {
    throw new Error('Target wires must be hidden');
  }

  await playersDb.markDoubleDetectorUsed(playerId);

  const turn = await turnsDb.createTurn(gameId, playerId, 'double_detector', targetWireId1, null, targetWireId2);

  const sameValue = wire1.value === wire2.value;
  await turnsDb.updateTurnResult(turn.id, sameValue ? 'success' : 'fail');

  // Double detector reveals whether two wires match but doesn't cut them
  // The result is communicated to the player only
  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: sameValue ? 'success' : 'fail' }, game: advancedGame, updatedWires: [] };
}

export async function executePlayerReady(
  gameId: string,
  playerId: string,
): Promise<{ players: Player[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'waiting') throw new Error('Game is not in waiting phase');

  await playersDb.markPlayerReady(playerId);
  const players = await playersDb.getPlayersByGameId(gameId);
  return { players };
}

async function validateTurn(gameId: string, playerId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'active') throw new Error('Game is not active');
  if (game.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
  return game;
}

async function checkValidation(gameId: string, wireValue: string, wireColor: WireColor): Promise<boolean> {
  const wiresOfValueColor = await wiresDb.getWiresByValueColorAndGame(gameId, wireValue, wireColor);
  const allCut = wiresOfValueColor.every(w => w.status === 'cut');
  if (allCut && wiresOfValueColor.length === 4) {
    await tokensDb.createValidationToken(gameId, wireValue, wireColor);
    return true;
  }
  return false;
}

export async function executeRevealReds(
  gameId: string,
  playerId: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await validateTurn(gameId, playerId);

  const missionConfig = MISSION_CONFIGS[game.mission];
  if (!missionConfig) throw new Error('Invalid mission');

  const hasRedWires = missionConfig.wireGroups.some(g => g.color === 'red');
  if (!hasRedWires) throw new Error('Reveal reds not available in this mission');

  const turn = await turnsDb.createTurn(gameId, playerId, 'reveal_reds', null, null);

  // Reveal all hidden red wires across all players in the game
  const updatedWires = await wiresDb.revealRedWires(gameId);

  await turnsDb.updateTurnResult(turn.id, 'success');

  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: 'success' }, game: advancedGame, updatedWires };
}

export async function executeSelectOpponentWire(
  gameId: string,
  playerId: string,
  wireId: string,
): Promise<{ game: Game; wire: Wire; answererPlayer: Player }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');
  if (game.currentTurnPlayerId !== playerId) throw new Error('Not your turn');

  const wire = await wiresDb.getWireById(wireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId === playerId) throw new Error('Cannot select your own wire');
  if (wire.status !== 'hidden') throw new Error('Wire already revealed or cut');

  const answererPlayer = await playersDb.getPlayerById(wire.playerId);
  if (!answererPlayer) throw new Error('Player not found');

  // Set pending interrogation
  const updatedGame = await gamesDb.setPendingInterrogation(gameId, playerId, wire.playerId, wireId);

  return { game: updatedGame, wire, answererPlayer };
}

export async function executeAnswerWireQuestion(
  gameId: string,
  playerId: string,
  answer: 'yes' | 'no',
): Promise<{ game: Game; message: string; updatedWires: Wire[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');
  if (!game.pendingInterrogationAnswererId) throw new Error('No pending question');
  if (game.pendingInterrogationAnswererId !== playerId) throw new Error('This question is not for you');

  const wire = await wiresDb.getWireById(game.pendingInterrogationWireId!);
  if (!wire) throw new Error('Wire not found');

  const askerPlayer = await playersDb.getPlayerById(game.pendingInterrogationAskerId!);
  if (!askerPlayer) throw new Error('Asker not found');

  const updatedWires: Wire[] = [];
  let message = '';

  if (answer === 'yes') {
    // Answer is correct - reveal the wire and create validation token
    const revealedWire = await wiresDb.updateWireStatus(wire.id, 'revealed');
    updatedWires.push(revealedWire);

    // Create validation token for the asker
    await tokensDb.createValidationToken(gameId, wire.value!, wire.color);
    message = `Correct! Wire ${wire.rackPosition + 1} is revealed as ${wire.value}`;
  } else {
    // Answer is incorrect
    if (wire.color === 'red') {
      // Game over - red wire was guessed
      const lostGame = await gamesDb.updateGameStatus(gameId, 'lost');
      await gamesDb.clearPendingInterrogation(gameId);
      return { game: lostGame, message: 'Game Over! Red wire guessed!', updatedWires };
    } else {
      // Place info token on the wire
      await tokensDb.createInfoToken(gameId, wire.id, wire.value!);
      updatedWires.push(wire);
      message = `Incorrect! Info token placed on wire ${wire.rackPosition + 1}`;
    }
  }

  // Clear pending interrogation - answer has been given
  const updatedGame = await gamesDb.clearPendingInterrogation(gameId);

  return { game: updatedGame, message, updatedWires };
}

export async function executeNextTurn(gameId: string, playerId: string): Promise<{ game: Game }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');
  if (game.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
  if (game.pendingInterrogationAnswererId) throw new Error('Cannot advance turn while question is pending');

  const players = await playersDb.getPlayersByGameId(gameId);
  const currentIndex = players.findIndex(p => p.id === game.currentTurnPlayerId);
  const nextIndex = (currentIndex + 1) % players.length;
  const nextGame = await gamesDb.updateCurrentTurn(gameId, players[nextIndex].id);

  return { game: nextGame };
}

async function checkWinCondition(gameId: string): Promise<boolean> {
  const allWires = await wiresDb.getWiresByGameId(gameId);
  return allWires.every(w => w.status === 'cut');
}

async function advanceTurn(gameId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');

  const players = await playersDb.getPlayersByGameId(gameId);
  const currentIndex = players.findIndex(p => p.id === game.currentTurnPlayerId);
  const nextIndex = (currentIndex + 1) % players.length;
  return await gamesDb.updateCurrentTurn(gameId, players[nextIndex].id);
}
