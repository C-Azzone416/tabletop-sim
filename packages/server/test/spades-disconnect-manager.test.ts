import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPADES_RECONNECT_GRACE_MS,
  SpadesDisconnectManager,
} from '../server/src/spades/disconnect-manager';

describe('SpadesDisconnectManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pauses immediately and waits the full 60 seconds before takeover', async () => {
    const onPause = vi.fn();
    const onTakeover = vi.fn();
    const manager = new SpadesDisconnectManager({ onPause, onTakeover }, () => 1_000);

    const record = manager.disconnect('game-1', 'player-1', 'south');
    expect(record.takeoverAt).toBe(61_000);
    expect(manager.isPaused('game-1')).toBe(true);
    expect(onPause).toHaveBeenCalledWith(record);

    await vi.advanceTimersByTimeAsync(SPADES_RECONNECT_GRACE_MS - 1);
    expect(onTakeover).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTakeover).toHaveBeenCalledWith(record);
    expect(manager.isPaused('game-1')).toBe(false);
  });

  it('cancels takeover and resumes when the same player reconnects in time', async () => {
    const onReconnect = vi.fn();
    const onTakeover = vi.fn();
    const manager = new SpadesDisconnectManager({ onReconnect, onTakeover });
    const record = manager.disconnect('game-1', 'player-1', 'west');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(manager.reconnect('game-1', 'player-1')).toBe(true);
    expect(onReconnect).toHaveBeenCalledWith(record);
    expect(manager.isPaused('game-1')).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onTakeover).not.toHaveBeenCalled();
  });

  it('tracks simultaneous disconnects independently and clears finished games', () => {
    const manager = new SpadesDisconnectManager({ onTakeover: vi.fn() });
    manager.disconnect('game-1', 'player-1', 'north');
    manager.disconnect('game-1', 'player-2', 'south');
    manager.disconnect('game-2', 'player-3', 'east');

    expect(manager.getPending('game-1')).toHaveLength(2);
    manager.clearGame('game-1');
    expect(manager.getPending('game-1')).toEqual([]);
    expect(manager.getPending('game-2')).toHaveLength(1);
  });
});
