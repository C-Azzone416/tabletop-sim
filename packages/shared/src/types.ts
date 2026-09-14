// Game state types

import type { GameId } from './game-registry';
import type { FlipTableView } from './flip-view';

export type GameStatus = 'waiting' | 'setup' | 'active' | 'won' | 'lost';
export type WireColor = 'blue' | 'yellow' | 'red';
export type WireStatus = 'hidden' | 'cut' | 'revealed';
export type ActionType = 'dual_cut' | 'solo_cut' | 'double_detector' | 'reveal_reds';
export type TurnResult = 'success' | 'fail' | 'explosion';

export interface Game {
  id: string;
  gameType: GameId;
  mission: number;
  status: GameStatus;
  /**
   * #437 — the host's chosen room capacity, not the game's registry
   * ceiling. Persisted at create_game so join_game (and the lobby's
   * "n/<count>" display) can enforce/show what the host actually asked for
   * rather than the game's maximum, which may be higher.
   */
  maxPlayers: number;
  captainId: string | null;
  currentTurnPlayerId: string | null;
  joinCode: string;
  detonatorPosition: number;
  detonatorMax: number;
  pendingInterrogationAskerId: string | null;
  pendingInterrogationAnswererId: string | null;
  pendingInterrogationWireId: string | null;
  pendingDualCutWireId: string | null;
  pendingDualCutProposerId: string | null;
  pendingDualCutGuessedValue: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  gameId: string;
  name: string;
  seatOrder: number;
  doubleDetectorUsed: boolean;
  ready: boolean;
  setupDone: boolean;
  joinedAt: string;
}

export interface Wire {
  id: string;
  gameId: string;
  playerId: string;
  value: string | null;
  /**
   * Null in client-bound views of OTHER players' hidden wires (#187):
   * color is mission-deciding information on red-wire missions, so it is
   * redacted exactly like value. Always present on server-side DB rows.
   */
  color: WireColor | null;
  /**
   * 1-based position in the player's rack (wire-dealer.ts assigns
   * index + 1, never 0). This is already the player-facing "Wire #N"
   * number — display it as-is, do not add 1 again (#147).
   */
  rackPosition: number;
  status: WireStatus;
}

export interface InfoToken {
  id: string;
  gameId: string;
  wireId: string;
  value: string;
  placedAt: string;
  /**
   * True for tokens created by dev tooling (/dev/reveal-all-tokens, the
   * seed-near-win backfill) rather than real gameplay. Only these are
   * removed by POST /dev/hide-dev-tokens (#172).
   */
  devCreated: boolean;
}

export type MissionOutcomeResult = 'won' | 'lost';

/**
 * Per-profile best outcome for a mission (#170): 'won' once beaten (never
 * downgraded by a later loss), 'lost' if only tried and failed, no row at
 * all if never played. Feeds the home-screen indicators and #179's unlocks.
 */
export interface MissionOutcome {
  profileId: string;
  mission: number;
  outcome: MissionOutcomeResult;
  updatedAt: string;
}

/**
 * #215/#190 — a value revealed as "possible" at setup under a mission's
 * partial-knowledge "N out of M" draw (WireGroup.candidatePoolSize > count).
 * Not a Wire: some candidates never become a real dealt tile (set aside
 * unseen), so this has no owner/rack position. Deliberately has NO
 * dealt/confirmed flag — sending one would leak which candidates are
 * actually in play, killing the deduction mechanic. Broadcast identically
 * to every player (no per-player redaction, unlike Wire); the client
 * derives "confirmed in play" itself by cross-referencing a candidate's
 * (color, value) against wires that become visible through normal play.
 */
export interface WireCandidate {
  gameId: string;
  color: WireColor;
  value: string;
}

export interface ValidationToken {
  id: string;
  gameId: string;
  wireValue: string;
  wireColor: WireColor;
  validatedAt: string;
}

export interface Turn {
  id: string;
  gameId: string;
  playerId: string;
  actionType: ActionType;
  targetWireId: string | null;
  targetWireId2: string | null;
  guessedValue: string | null;
  result: TurnResult | null;
  createdAt: string;
}

// WebSocket message types

export type ClientMessage =
  // #437 — maxPlayers is the host's chosen room capacity, required of the
  // caller for the same reason gameType is (#313): no client-side default,
  // so a missing/invalid value is a rejectable error server-side rather than
  // a silently-assumed one.
  | { type: 'create_game'; playerName: string; gameType: GameId; maxPlayers: number }
  | { type: 'join_game'; joinCode: string; playerName: string }
  | { type: 'start_game'; mission?: number }
  | { type: 'place_info_token'; wireId: string }
  | { type: 'propose_dual_cut'; targetWireId: string; guessedValue: string }
  | { type: 'respond_dual_cut'; accepted: boolean }
  | { type: 'complete_dual_cut'; ownWireId: string }
  | { type: 'solo_cut'; wireValue: string }
  | { type: 'double_detector'; targetWireId: string; targetWireId2: string }
  | { type: 'reveal_reds' }
  | { type: 'player_ready' }
  | { type: 'next_mission'; mission: number }
  // #387 — Flip actions. Note what these deliberately do NOT carry: an
  // acting-player id. The server takes the actor from the socket's
  // authenticated binding, so there is no field in which a client could claim
  // to be another seat.
  //
  // `targetPlayerId` is the game-scoped player id, matching what the client
  // already holds: FlipTableView speaks player ids throughout, and the target
  // picker renders straight off `pendingAction.eligibleTargetIds`.
  // #358 — the dealer triggers each round explicitly, including the first;
  // without this there is no way to start play after a seed, or the next
  // round after one ends.
  | { type: 'flip_start_round' }
  | { type: 'flip_hit' }
  | { type: 'flip_freeze' }
  | { type: 'flip_choose_freeze_target'; targetPlayerId: string }
  | { type: 'flip_choose_flip3_target'; targetPlayerId: string }
  // #431 — no payload: the actor comes from the socket's authenticated
  // binding, same reasoning as the Flip actions above.
  | { type: 'leave_game' }
  // #438 — host-only, lobby-only room resize. No acting-player field, same
  // reasoning as leave_game: the host is derived server-side from
  // game.captainId against the socket's bound player id, never claimed by
  // the client. maxPlayers is the requested new value, validated against
  // the game's registry bounds and current occupancy in engine.updatePlayerCount.
  | { type: 'update_player_count'; maxPlayers: number };

export type ServerMessage =
  | { type: 'game_created'; game: Game; player: Player }
  | { type: 'joined_game'; game: Game; player: Player; players: Player[] }
  | { type: 'game_started'; game: Game; players: Player[]; wires: Wire[]; candidates: WireCandidate[] }
  | { type: 'setup_complete'; game: Game }
  // #382 — the wire game's shape, unchanged. `flip` is absent on this path.
  | { type: 'game_state'; game: Game; players: Player[]; wires: Wire[]; infoTokens: InfoToken[]; validationTokens: ValidationToken[]; localPlayerId: string; candidates: WireCandidate[]; flip?: undefined }
  // #382 — Flip carries no wires/tokens/candidates at all, and no wiresDb call
  // is made to produce it. Identical for every player: `localPlayerId` says
  // which seat is yours, never what you may see (#358 — no hidden state).
  //
  // #406 — `flip` is NULL in the lobby, before the dealer starts the first
  // round. That is a normal state, not an error: under the ruled
  // awaiting-round-start flow a Flip room legitimately has no table until the
  // round begins, and the client still needs `game` and `players` to render
  // the lobby at all. The KEY is always present on this variant, so narrow on
  // its presence (`'flip' in msg`) rather than its truthiness — a null would
  // otherwise fall through to the wire-game branch and read `wires`.
  | { type: 'game_state'; game: Game; players: Player[]; localPlayerId: string; flip: FlipTableView | null }
  | { type: 'player_joined'; player: Player }
  | { type: 'dual_cut_proposed'; proposingPlayerId: string; targetPlayerId: string; targetWireId: string; targetWireRackPosition: number; guessedValue: string }
  | { type: 'dual_cut_correct'; targetWireId: string; targetWireRackPosition: number; targetWireColor: WireColor }
  | { type: 'turn_result'; turn: Turn; game: Game; updatedWires: Wire[] }
  | { type: 'validation_complete'; wireValue: string; wireColor: WireColor; game: Game }
  | { type: 'wire_updated'; wire: Wire }
  | { type: 'players_updated'; players: Player[] }
  | { type: 'game_over'; result: 'won' | 'lost'; reason: string }
  // #431 — the "someone left" notice channel for a non-host departure
  // (leave or disconnect, lobby or mid-game). Carries enough for a client to
  // say who left; what happens next (stay in the lobby, end the game,
  // continue play) is decided per game type by #432/#433/#434, not here.
  //
  // #432 — `gameEnded` is only ever true for a MID-GAME departure that the
  // per-game dispatch point (game-engine.ts) decided ends the mission (Wire
  // Game today). It is never set for a lobby departure (#454's silent
  // roster-filter case) or for a non-ending mid-game departure (Flip,
  // #434). Optional/omittable rather than a plain boolean so existing
  // lobby-only `player_left` handling (#454) never has to construct it.
  | { type: 'player_left'; playerId: string; playerName: string; gameEnded?: boolean }
  // #431 — the host leaving or disconnecting closes the room in every phase
  // and every game (Caroline's ruling — captaincy does not reassign). Every
  // remaining client routes to /play; the join code no longer resolves.
  | { type: 'room_closed'; reason: string }
  | { type: 'error'; message: string };
