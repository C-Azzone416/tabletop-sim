import type { CardInstance, StandardSuit } from '../cards/card-engine.js';

export const SPADES_SEATS = ['north', 'east', 'south', 'west'] as const;
export type SpadesSeat = (typeof SPADES_SEATS)[number];
export type SpadesTeam = 'north-south' | 'east-west';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type TargetScore = 250 | 500 | 750;
export type SpadesPhase = 'blind-nil' | 'bidding' | 'playing' | 'finished';

export type SpadesBid =
  | { readonly kind: 'normal'; readonly tricks: number }
  | { readonly kind: 'nil' }
  | { readonly kind: 'blind-nil' };

export interface TrickPlay {
  readonly seat: SpadesSeat;
  readonly card: CardInstance;
}

export interface TrickState {
  readonly leader: SpadesSeat;
  readonly plays: readonly TrickPlay[];
}

export interface TeamScore {
  readonly score: number;
  readonly bags: number;
}

export interface HandScoreInput {
  readonly team: SpadesTeam;
  readonly bids: Readonly<Record<SpadesSeat, SpadesBid>>;
  readonly tricksWon: Readonly<Record<SpadesSeat, number>>;
  readonly previous: TeamScore;
}

export interface HandScoreResult extends TeamScore {
  readonly handPoints: number;
  readonly contractPoints: number;
  readonly nilPoints: number;
  readonly bagPoints: number;
  readonly bagPenalty: number;
  readonly contractMade: boolean;
}

export interface BotPlayContext {
  readonly hand: readonly CardInstance[];
  readonly trick: TrickState;
  readonly spadesBroken: boolean;
  readonly difficulty: BotDifficulty;
  readonly random?: () => number;
}

export interface BotBidContext {
  readonly hand: readonly CardInstance[];
  readonly difficulty: BotDifficulty;
  readonly random?: () => number;
}

export interface BotBlindNilContext {
  readonly difficulty: BotDifficulty;
  readonly teamScore: number;
  readonly opponentScore: number;
  readonly targetScore: TargetScore;
  readonly random?: () => number;
}

export interface HumanLobbyPlayer {
  readonly id: string;
  readonly name: string;
}

export interface SeatedSpadesPlayer extends HumanLobbyPlayer {
  readonly seat: SpadesSeat;
  readonly team: SpadesTeam;
  readonly isBot: boolean;
  readonly difficulty?: BotDifficulty;
}

export type SeatMap<T> = Record<SpadesSeat, T>;
export type PartialSeatMap<T> = Partial<Record<SpadesSeat, T>>;

export interface SpadesGameState {
  readonly phase: SpadesPhase;
  readonly targetScore: TargetScore;
  readonly handNumber: number;
  readonly players: readonly SeatedSpadesPlayer[];
  readonly dealer: SpadesSeat;
  readonly currentSeat: SpadesSeat | null;
  readonly handsRevealed: boolean;
  readonly hands: SeatMap<readonly CardInstance[]>;
  readonly blindNilChoices: PartialSeatMap<boolean>;
  readonly bids: PartialSeatMap<SpadesBid>;
  readonly currentTrick: TrickState;
  readonly tricksWon: SeatMap<number>;
  readonly scores: Record<SpadesTeam, TeamScore>;
  readonly spadesBroken: boolean;
  readonly winner: SpadesTeam | null;
}

export interface StartSpadesGameOptions {
  readonly humans: readonly HumanLobbyPlayer[];
  readonly botDifficulties?: readonly BotDifficulty[];
  readonly targetScore: TargetScore;
  readonly random?: () => number;
}

export interface SpadesPlayerView {
  readonly phase: SpadesPhase;
  readonly targetScore: TargetScore;
  readonly handNumber: number;
  readonly players: readonly SeatedSpadesPlayer[];
  readonly dealer: SpadesSeat;
  readonly currentSeat: SpadesSeat | null;
  readonly hand: readonly CardInstance[];
  readonly opponentHandCounts: Readonly<Record<SpadesSeat, number>>;
  readonly blindNilChoicesMade: number;
  readonly bids: PartialSeatMap<SpadesBid>;
  readonly currentTrick: TrickState;
  readonly tricksWon: SeatMap<number>;
  readonly scores: Record<SpadesTeam, TeamScore>;
  readonly spadesBroken: boolean;
  readonly winner: SpadesTeam | null;
}

export interface LegalPlayResult {
  readonly legal: boolean;
  readonly reason?: 'card-not-in-hand' | 'must-follow-suit' | 'spades-not-broken';
}

export interface CompletedTrick {
  readonly winner: SpadesSeat;
  readonly leadSuit: StandardSuit;
  readonly plays: readonly TrickPlay[];
}
