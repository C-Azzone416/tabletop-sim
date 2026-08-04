import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CardInstance, SpadesPlayerView } from '@tabletop/shared';
import { SpadesTable } from '../client/app/components/spades/SpadesTable';

const cards: CardInstance[] = [
  { id: 'club-2', deckIndex: 0, suit: 'clubs', rank: '2' },
  { id: 'heart-a', deckIndex: 0, suit: 'hearts', rank: 'ace' },
  { id: 'spade-k', deckIndex: 0, suit: 'spades', rank: 'king' },
];

function makeView(overrides: Partial<SpadesPlayerView> = {}): SpadesPlayerView {
  return {
    phase: 'playing',
    targetScore: 250,
    handNumber: 1,
    players: [
      { id: 'n', name: 'Ari', seat: 'north', team: 'north-south', isBot: true, difficulty: 'easy' },
      { id: 'e', name: 'Mira', seat: 'east', team: 'east-west', isBot: true, difficulty: 'normal' },
      { id: 's', name: 'Ben', seat: 'south', team: 'north-south', isBot: false },
      { id: 'w', name: 'Finn', seat: 'west', team: 'east-west', isBot: true, difficulty: 'hard' },
    ],
    dealer: 'north',
    currentSeat: 'south',
    hand: cards,
    opponentHandCounts: { north: 3, east: 3, south: 0, west: 3 },
    blindNilChoicesMade: 4,
    bids: {
      north: { kind: 'normal', tricks: 3 },
      east: { kind: 'nil' },
      south: { kind: 'normal', tricks: 4 },
      west: { kind: 'blind-nil' },
    },
    currentTrick: { leader: 'north', plays: [{ seat: 'north', card: { id: 'lead', deckIndex: 0, suit: 'clubs', rank: 'king' } }] },
    tricksWon: { north: 1, east: 0, south: 2, west: 0 },
    scores: { 'north-south': { score: 120, bags: 2 }, 'east-west': { score: 85, bags: 5 } },
    spadesBroken: false,
    winner: null,
    ...overrides,
  };
}

const handlers = () => ({ onBlindNilChoice: vi.fn(), onBid: vi.fn(), onPlayCard: vi.fn() });

describe('SpadesTable responsive hybrid', () => {
  it('keeps the viewer at the full bottom hand and opponents in compact relative seats', () => {
    render(<SpadesTable view={makeView()} viewingSeat="south" {...handlers()} />);
    expect(screen.getByLabelText('Your hand')).toHaveAttribute('data-position', 'bottom');
    expect(screen.getByLabelText('Ari seat')).toHaveAttribute('data-position', 'top');
    expect(screen.getByLabelText('Finn seat')).toHaveAttribute('data-position', 'left');
    expect(screen.getByLabelText('Mira seat')).toHaveAttribute('data-position', 'right');
    expect(within(screen.getByTestId('player-hand')).getAllByRole('button')).toHaveLength(3);
  });

  it('shows no cards and submits a private blind-nil choice', () => {
    const actions = handlers();
    render(<SpadesTable view={makeView({ phase: 'blind-nil', hand: [], bids: {}, blindNilChoicesMade: 2 })} viewingSeat="south" {...actions} />);
    expect(screen.queryByTestId('player-hand')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 4 players locked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Blind Nil' }));
    expect(actions.onBlindNilChoice).toHaveBeenCalledWith(true);
  });

  it('offers nil and 1 through 13 only when it is the viewer\'s turn to bid', () => {
    const actions = handlers();
    render(<SpadesTable view={makeView({ phase: 'bidding', currentSeat: 'south' })} viewingSeat="south" {...actions} />);
    const controls = screen.getByLabelText('Bid controls');
    expect(within(controls).getAllByRole('button')).toHaveLength(14);
    fireEvent.click(within(controls).getByRole('button', { name: 'Nil' }));
    fireEvent.click(within(controls).getByRole('button', { name: '4' }));
    expect(actions.onBid).toHaveBeenNthCalledWith(1, { kind: 'nil' });
    expect(actions.onBid).toHaveBeenNthCalledWith(2, { kind: 'normal', tricks: 4 });
  });

  it('enables only cards legal under follow-suit rules', () => {
    const actions = handlers();
    render(<SpadesTable view={makeView()} viewingSeat="south" {...actions} />);
    expect(screen.getByRole('button', { name: '2 of Clubs' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'A of Hearts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'K of Spades' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '2 of Clubs' }));
    expect(actions.onPlayCard).toHaveBeenCalledWith('club-2');
  });
});
