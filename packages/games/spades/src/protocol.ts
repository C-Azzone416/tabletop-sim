import type { Game, Player } from '@tabletop/shared';
import type {
  BotDifficulty,
  SpadesBid,
  SpadesPlayerView,
  SpadesSeat,
  TargetScore,
} from './types';

/** Spades-specific messages layered onto the platform WebSocket protocol. */
export type SpadesClientMessage =
  | { readonly type: 'start_spades'; readonly targetScore: TargetScore; readonly botDifficulties: BotDifficulty[] }
  | { readonly type: 'spades_blind_nil'; readonly blindNil: boolean }
  | { readonly type: 'spades_bid'; readonly bid: Exclude<SpadesBid, { kind: 'blind-nil' }> }
  | { readonly type: 'spades_play'; readonly cardId: string }
  | { readonly type: 'spades_continue_hand' };

export type SpadesServerMessage = {
  readonly type: 'spades_state';
  readonly game: Game;
  readonly players: Player[];
  readonly localPlayerId: string;
  readonly view: SpadesPlayerView;
  readonly viewingSeat: SpadesSeat;
  readonly pausedUntil?: string;
};
