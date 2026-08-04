import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameSelector } from '../client/app/components/GameSelector';

describe('GameSelector', () => {
  it('keeps both games available and marks the selected game', () => {
    render(<GameSelector selected="spades" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Spades/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Wire Game/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports a game change without navigating or creating a room', () => {
    const onSelect = vi.fn();
    render(<GameSelector selected="wire-game" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Spades/ }));
    expect(onSelect).toHaveBeenCalledWith('spades');
  });

  it('disables both choices while room creation is underway', () => {
    render(<GameSelector selected="spades" onSelect={() => {}} disabled />);
    expect(screen.getByRole('button', { name: /Spades/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Wire Game/ })).toBeDisabled();
  });
});
