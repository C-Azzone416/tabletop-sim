// Game state types

export type GameStatus = 'waiting' | 'setup' | 'active' | 'won' | 'lost';
export type WireColor = 'blue' | 'yellow' | 'red';
export type WireStatus = 'hidden' | 'cut' | 'revealed';
export type ActionType = 'dual_cut' | 'solo_cut' | 'double_detector' | 'reveal_reds';
export type TurnResult = 'success' | 'fail' | 'explosion';

export interface Game {
  id: string;
  mission: number;
  status: GameStatus;
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
  | { type: 'create_game'; playerName: string }
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
  | { type: 'next_mission'; mission: number };

export type ServerMessage =
  | { type: 'game_created'; game: Game; player: Player }
  | { type: 'joined_game'; game: Game; player: Player; players: Player[] }
  | { type: 'game_started'; game: Game; players: Player[]; wires: Wire[]; candidates: WireCandidate[] }
  | { type: 'setup_complete'; game: Game }
  | { type: 'game_state'; game: Game; players: Player[]; wires: Wire[]; infoTokens: InfoToken[]; validationTokens: ValidationToken[]; localPlayerId: string; candidates: WireCandidate[] }
  | { type: 'player_joined'; player: Player }
  | { type: 'dual_cut_proposed'; proposingPlayerId: string; targetPlayerId: string; targetWireId: string; targetWireRackPosition: number; guessedValue: string }
  | { type: 'dual_cut_correct'; targetWireId: string; targetWireRackPosition: number; targetWireColor: WireColor }
  | { type: 'turn_result'; turn: Turn; game: Game; updatedWires: Wire[] }
  | { type: 'validation_complete'; wireValue: string; wireColor: WireColor; game: Game }
  | { type: 'wire_updated'; wire: Wire }
  | { type: 'players_updated'; players: Player[] }
  | { type: 'game_over'; result: 'won' | 'lost'; reason: string }
  | { type: 'error'; message: string };
