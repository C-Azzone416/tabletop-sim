// Game state types

export type GameStatus = 'waiting' | 'active' | 'won' | 'lost';
export type WireColor = 'blue' | 'yellow' | 'red';
export type WireStatus = 'hidden' | 'cut' | 'revealed';
export type ActionType = 'duo_cut' | 'solo_cut' | 'reveal_reds';
export type TurnResult = 'success' | 'fail' | 'explosion';

export interface Game {
  id: string;
  mission: number;
  status: GameStatus;
  captainId: string | null;
  detonatorPosition: number;
  detonatorMax: number;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  gameId: string;
  name: string;
  seatOrder: number;
  joinedAt: string;
}

export interface Wire {
  id: string;
  gameId: string;
  playerId: string;
  value: string;
  color: WireColor;
  rackPosition: number;
  status: WireStatus;
}

export interface InfoToken {
  id: string;
  gameId: string;
  wireId: string;
  value: string;
  placedAt: string;
}

export interface ValidationToken {
  id: string;
  gameId: string;
  wireValue: string;
  validatedAt: string;
}

export interface Turn {
  id: string;
  gameId: string;
  playerId: string;
  actionType: ActionType;
  targetWireId: string | null;
  guessedValue: string | null;
  result: TurnResult | null;
  createdAt: string;
}

// WebSocket message types

export type ClientMessage =
  | { type: 'join_game'; gameId: string; playerName: string }
  | { type: 'start_game' }
  | { type: 'duo_cut'; targetWireId: string; guessedValue: string }
  | { type: 'solo_cut'; wireValue: string }
  | { type: 'reveal_reds' };

export type ServerMessage =
  | { type: 'game_state'; game: Game; players: Player[]; wires: Wire[]; infoTokens: InfoToken[]; validationTokens: ValidationToken[] }
  | { type: 'player_joined'; player: Player }
  | { type: 'turn_result'; turn: Turn; game: Game }
  | { type: 'wire_updated'; wire: Wire }
  | { type: 'game_over'; result: 'won' | 'lost'; reason: string }
  | { type: 'error'; message: string };
