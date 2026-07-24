import { randomInt } from 'node:crypto';
import { MISSION_CONFIGS } from '@tabletop/shared';
import type { Game, Player, Wire, Turn, WireColor } from '@tabletop/shared';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as wiresDb from '../db/wires.js';
import * as tokensDb from '../db/tokens.js';
import * as turnsDb from '../db/turns.js';
import * as outcomesDb from '../db/outcomes.js';
import { dealWires } from './wire-dealer.js';

// #170 — the single way a game reaches 'won'/'lost'. Besides the status
// transition, records the mission outcome for every seated profile
// (best-outcome-wins upsert), so the home-screen indicators and #179's
// unlock derivation always have the record the moment the game ends —
// including before a #157 next_mission resets the same game row.
async function endGame(gameId: string, result: 'won' | 'lost'): Promise<Game> {
  const endedGame = await gamesDb.updateGameStatus(gameId, result);

  // #170 amendment (dingo 03:23, heron 03:39): dev-seeded games (via
  // /dev/seed, /dev/seed-near-win) must record NO outcomes — they're not
  // real play and would pollute the home-screen indicators / #179's
  // unlocks. Checked on created_via, not ENABLE_DEV_SEED, so real staging
  // playtests (lobby-created, ENABLE_DEV_SEED may still be true there) are
  // unaffected.
  const createdVia = await gamesDb.getGameCreatedVia(gameId);
  if (createdVia === 'dev_seed') {
    return endedGame;
  }

  const profileIds = await playersDb.getPlayerProfileIdsByGameId(gameId);
  for (const profileId of profileIds) {
    await outcomesDb.upsertMissionOutcome(profileId, endedGame.mission, result);
  }
  return endedGame;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

export async function createGame(
  playerName: string,
  profileId?: string,
  createdVia: gamesDb.GameCreatedVia = 'lobby',
): Promise<{ game: Game; player: Player }> {
  const joinCode = generateJoinCode();
  const game = await gamesDb.createGame(joinCode, 1, createdVia);
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
  if (!players.every(p => p.ready)) throw new Error('Not all players are ready');

  const missionConfig = MISSION_CONFIGS[mission];
  if (!missionConfig) throw new Error('Invalid mission');

  // Lives = players − 1 (spec rule: 2p = 1 life, 3p = 2 lives, 4p = 3 lives)
  const detonatorMax = Math.max(1, players.length - 1);

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

  // Update game to setup phase and kick off turn-ordered opening placement:
  // captain (always seat 0) places first, then clockwise via advanceTurn.
  await gamesDb.updateDetonator(gameId, 0);
  await gamesDb.updateGameStatus(gameId, 'setup');
  await gamesDb.updateCurrentTurn(gameId, game.captainId!);
  const updatedGame = await gamesDb.updateDetonatorMax(gameId, detonatorMax);

  return { game: updatedGame, players, wires: createdWires };
}

// #157 — "continue playing" after a win or loss: the same game row (same id,
// same joinCode, same seated players) is reused for the next mission rather
// than rebuilding a lobby. Ruled approved (#continue-playing, 2026-07-23):
// same-game-row transition, hard-delete the prior mission's wires/tokens/
// turns (round-scoped history is a deliberate future follow-up, #163), next-
// mission-up default clamped/validated by the caller via `mission`.
export async function executeNextMission(
  gameId: string,
  requestingPlayerId: string,
  mission: number,
): Promise<{ game: Game; players: Player[]; wires: Wire[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'won' && game.status !== 'lost') throw new Error('Game is not in a won or lost state');
  if (game.captainId !== requestingPlayerId) throw new Error('Only the captain can start the next mission');

  const missionConfig = MISSION_CONFIGS[mission];
  if (!missionConfig) throw new Error('Invalid mission');

  const players = await playersDb.getPlayersByGameId(gameId);

  // Clear the prior mission's per-mission artifacts before dealing new ones.
  // Order matters: turns reference wires with no ON DELETE cascade, so they
  // must go first; info_tokens cascade from wires automatically.
  await turnsDb.deleteByGameId(gameId);
  await wiresDb.deleteByGameId(gameId);
  await tokensDb.deleteValidationTokensByGameId(gameId);
  await playersDb.resetDoubleDetectorForGame(gameId);

  const detonatorMax = Math.max(1, players.length - 1);

  await gamesDb.updateMission(gameId, mission);

  const playerIds = players.map(p => p.id);
  const dealedWires = dealWires(playerIds, game.captainId!, mission);

  const createdWires: Wire[] = [];
  for (const dw of dealedWires) {
    const wire = await wiresDb.createWire(gameId, dw.playerId, dw.value, dw.color, dw.rackPosition);
    createdWires.push(wire);
  }

  await gamesDb.updateDetonator(gameId, 0);
  await gamesDb.clearPendingDualCut(gameId);
  await gamesDb.updateGameStatus(gameId, 'setup');
  await gamesDb.updateCurrentTurn(gameId, game.captainId!);
  const updatedGame = await gamesDb.updateDetonatorMax(gameId, detonatorMax);

  return { game: updatedGame, players, wires: createdWires };
}

// Turn-ordered opening placement: captain places first (set as currentTurnPlayerId
// by startGame), then clockwise. Placing a token is the per-player "ready" action
// itself — there's no separate completion step. Once every player has placed,
// this same call transitions the game to 'active' and advances the turn onto
// whoever's real first mission turn is, via the same advanceTurn used for
// ordinary gameplay turns.
export async function executePlaceInfoToken(
  gameId: string,
  playerId: string,
  wireId: string,
): Promise<{ infoToken: import('@tabletop/shared').InfoToken }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');
  if (game.currentTurnPlayerId !== playerId) throw new Error('Not your turn');

  const wire = await wiresDb.getWireById(wireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId !== playerId) throw new Error('Can only place info token on your own wire');
  if (wire.status !== 'hidden') throw new Error('Wire already cut or revealed');

  const [allWires, existingTokens, players] = await Promise.all([
    wiresDb.getWiresByGameId(gameId),
    tokensDb.getInfoTokensByGameId(gameId),
    playersDb.getPlayersByGameId(gameId),
  ]);
  const wireOwner = new Map(allWires.map(w => [w.id, w.playerId]));
  const alreadyPlaced = existingTokens.some(t => wireOwner.get(t.wireId) === playerId);
  if (alreadyPlaced) throw new Error('Info token already placed');

  const infoToken = await tokensDb.createInfoToken(gameId, wireId, wire.value!);

  const playersWithTokens = new Set(
    [...existingTokens, infoToken]
      .map(t => wireOwner.get(t.wireId))
      .filter((id): id is string => !!id)
  );
  const allDone = playersWithTokens.size === players.length;

  await advanceTurn(gameId);
  if (allDone) {
    await gamesDb.updateGameStatus(gameId, 'active');
  }

  return { infoToken };
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

export async function executeProposeDualCut(
  gameId: string,
  playerId: string,
  targetWireId: string,
  guessedValue: string,
): Promise<{ game: Game; wire: Wire; targetPlayer: Player }> {
  const game = await validateTurn(gameId, playerId);
  if (game.pendingDualCutWireId) throw new Error('Dual cut already pending');

  const wire = await wiresDb.getWireById(targetWireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId === playerId) throw new Error('Cannot target your own wire with dual cut');
  if (wire.status !== 'hidden') throw new Error('Wire already cut or revealed');
  if (wire.value === null) throw new Error('Wire has no value');

  const targetPlayer = await playersDb.getPlayerById(wire.playerId);
  if (!targetPlayer) throw new Error('Player not found');

  // Physical-game rule: you must already hold a matching tile before you can
  // guess it. Mirrors executeCompleteDualCut's completion-time checks.
  const proposerWires = await wiresDb.getWiresByPlayerId(playerId);
  if (wire.color === 'blue') {
    const holdsMatch = proposerWires.some(w => w.status === 'hidden' && w.value === guessedValue);
    if (!holdsMatch) throw new Error('Must hold a matching wire to propose this guess');
  } else if (wire.color === 'yellow') {
    const holdsYellow = proposerWires.some(w => w.status === 'hidden' && w.color === 'yellow');
    if (!holdsYellow) throw new Error('Must hold a yellow wire to propose this guess');
  }

  const updatedGame = await gamesDb.setPendingDualCut(gameId, playerId, targetWireId, guessedValue);
  return { game: updatedGame, wire, targetPlayer };
}

type RespondDualCutResult =
  | { phase: 'completing'; game: Game; updatedWires: Wire[] }
  | { phase: 'fail' | 'game_over'; turn: Turn; game: Game; updatedWires: Wire[] };

export async function executeRespondDualCut(
  gameId: string,
  playerId: string,
  accepted: boolean,
): Promise<RespondDualCutResult> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'active') throw new Error('Game is not active');
  if (!game.pendingDualCutWireId || !game.pendingDualCutProposerId) throw new Error('No pending dual cut');

  const wire = await wiresDb.getWireById(game.pendingDualCutWireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.playerId !== playerId) throw new Error('Not your wire to respond to');

  if (accepted) {
    // Correct guess — reveal the target wire; proposer must still complete their half
    const revealedWire = await wiresDb.updateWireStatus(wire.id, 'revealed');
    const updatedGame = await gamesDb.getGameById(gameId) as Game;
    return { phase: 'completing', game: updatedGame, updatedWires: [revealedWire] };
  }

  // Wrong guess — check wire color for response
  const proposerId = game.pendingDualCutProposerId;

  if (wire.color === 'red') {
    // Red wrong guess = immediate game over
    const turn = await turnsDb.createTurn(gameId, proposerId, 'dual_cut', wire.id, game.pendingDualCutGuessedValue);
    await turnsDb.updateTurnResult(turn.id, 'fail');
    await gamesDb.clearPendingDualCut(gameId);
    const lostGame = await endGame(gameId, 'lost');
    return { phase: 'game_over', turn: { ...turn, result: 'fail' }, game: lostGame, updatedWires: [] };
  }

  // Blue or yellow wrong guess — place info token (color-aware) + lose 1 life
  const tokenValue = wire.color === 'yellow' ? 'YELLOW' : wire.value!;
  await tokensDb.createInfoToken(gameId, wire.id, tokenValue);

  const turn = await turnsDb.createTurn(gameId, proposerId, 'dual_cut', wire.id, game.pendingDualCutGuessedValue);
  await turnsDb.updateTurnResult(turn.id, 'fail');
  await gamesDb.clearPendingDualCut(gameId);

  const newPosition = game.detonatorPosition + 1;
  let updatedGame = await gamesDb.updateDetonator(gameId, newPosition);

  if (newPosition >= game.detonatorMax) {
    updatedGame = await endGame(gameId, 'lost');
    return { phase: 'game_over', turn: { ...turn, result: 'fail' }, game: updatedGame, updatedWires: [] };
  }

  updatedGame = await advanceTurn(gameId);
  return { phase: 'fail', turn: { ...turn, result: 'fail' }, game: updatedGame, updatedWires: [] };
}

export async function executeCompleteDualCut(
  gameId: string,
  playerId: string,
  ownWireId: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'active') throw new Error('Game is not active');
  if (!game.pendingDualCutWireId || !game.pendingDualCutProposerId) throw new Error('No pending dual cut');
  if (game.pendingDualCutProposerId !== playerId) throw new Error('Not your turn to complete dual cut');

  const targetWire = await wiresDb.getWireById(game.pendingDualCutWireId);
  if (!targetWire) throw new Error('Wire not found');
  if (targetWire.status !== 'revealed') throw new Error('Target wire is not revealed');

  const ownWire = await wiresDb.getWireById(ownWireId);
  if (!ownWire) throw new Error('Wire not found');
  if (ownWire.playerId !== playerId) throw new Error('Wire does not belong to you');
  if (ownWire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (ownWire.status !== 'hidden') throw new Error('Wire already cut or revealed');

  // Validate the selected own wire matches target wire rules
  if (targetWire.color === 'blue') {
    if (ownWire.value !== targetWire.value) throw new Error('Must reveal a wire with the same number');
  } else if (targetWire.color === 'yellow') {
    if (ownWire.color !== 'yellow') throw new Error('Must reveal a yellow wire');
  }

  // Cut both wires
  const cutTargetWire = await wiresDb.updateWireStatus(targetWire.id, 'cut');
  const cutOwnWire = await wiresDb.updateWireStatus(ownWireId, 'cut');
  const updatedWires = [cutTargetWire, cutOwnWire];

  const turn = await turnsDb.createTurn(gameId, playerId, 'dual_cut', targetWire.id, targetWire.value, ownWireId);
  await turnsDb.updateTurnResult(turn.id, 'success');

  await gamesDb.clearPendingDualCut(gameId);

  // Check validation for both wires
  await checkValidation(gameId, targetWire.value!, targetWire.color);
  await checkValidation(gameId, ownWire.value!, ownWire.color);

  // Check win condition
  let updatedGame: Game;
  const winResult = await checkWinCondition(gameId);
  if (winResult) {
    updatedGame = await endGame(gameId, 'won');
  } else {
    updatedGame = await advanceTurn(gameId);
  }

  return { turn: { ...turn, result: 'success' }, game: updatedGame, updatedWires };
}

export async function executeSoloCut(
  gameId: string,
  playerId: string,
  wireValue: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  await validateTurn(gameId, playerId);

  // Rules-correction (#150): solo cut is legal ONLY when the player holds
  // ALL remaining uncut wires of that number — every currently-hidden wire
  // with this value across the whole game must be owned by this player.
  // Hard-rejected up front, before any turn record or detonator change, the
  // same way #133's must-hold-value dual-cut guard rejects at propose time.
  const wiresOfValue = await wiresDb.getWiresByValueAndGame(gameId, wireValue);
  const hiddenOfValue = wiresOfValue.filter(w => w.status === 'hidden');
  const holdsAllRemaining = hiddenOfValue.length > 0 && hiddenOfValue.every(w => w.playerId === playerId);
  if (!holdsAllRemaining) {
    throw new Error('You must hold all remaining uncut wires of that number to solo cut it');
  }

  const turn = await turnsDb.createTurn(gameId, playerId, 'solo_cut', null, wireValue);

  // Legality guarantees every hidden wire of this value belongs to the
  // player — cut them all. Solo cut can no longer fail (that path lived on
  // wrong-guess penalties, which now belong to dual cuts only), so this is
  // always a success.
  const updatedWires: Wire[] = [];
  for (const w of hiddenOfValue) {
    const updated = await wiresDb.updateWireStatus(w.id, 'cut');
    updatedWires.push(updated);
  }
  await turnsDb.updateTurnResult(turn.id, 'success');

  // Check validation per color for any cut wires
  const cutColors = new Set(hiddenOfValue.map(w => w.color));
  for (const color of cutColors) {
    await checkValidation(gameId, wireValue, color);
  }

  // Check win
  const winResult = await checkWinCondition(gameId);
  if (winResult) {
    const wonGame = await endGame(gameId, 'won');
    return { turn: { ...turn, result: 'success' }, game: wonGame, updatedWires };
  }

  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: 'success' }, game: advancedGame, updatedWires };
}

export async function executeDoubleDetector(
  gameId: string,
  playerId: string,
  targetWireId1: string,
  targetWireId2: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  await validateTurn(gameId, playerId);

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

async function checkWinCondition(gameId: string): Promise<boolean> {
  const allWires = await wiresDb.getWiresByGameId(gameId);
  return allWires.every(w => w.status === 'cut');
}

export async function advanceTurn(gameId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');

  const players = await playersDb.getPlayersByGameId(gameId);
  const wires = await wiresDb.getWiresByGameId(gameId);
  const hiddenCountByPlayer = new Map<string, number>();
  for (const w of wires) {
    if (w.status === 'hidden') {
      hiddenCountByPlayer.set(w.playerId, (hiddenCountByPlayer.get(w.playerId) ?? 0) + 1);
    }
  }

  // Rules-correction (#152): a player with no uncut wires left is skipped
  // when rotating clockwise — no dead turns. Bounded to one full lap; if
  // every player is fully cut (should be unreachable, the win condition
  // fires first) this falls through to the plain next seat instead of
  // looping forever.
  const currentIndex = players.findIndex(p => p.id === game.currentTurnPlayerId);
  let nextIndex = currentIndex;
  for (let i = 0; i < players.length; i++) {
    nextIndex = (nextIndex + 1) % players.length;
    if ((hiddenCountByPlayer.get(players[nextIndex].id) ?? 0) > 0) {
      return await gamesDb.updateCurrentTurn(gameId, players[nextIndex].id);
    }
  }
  return await gamesDb.updateCurrentTurn(gameId, players[nextIndex].id);
}
