import type { SpadesSeat } from '@tabletop/game-spades';

export const SPADES_RECONNECT_GRACE_MS = 60_000;

export interface SpadesDisconnectRecord {
  readonly gameId: string;
  readonly playerId: string;
  readonly seat: SpadesSeat;
  readonly disconnectedAt: number;
  readonly takeoverAt: number;
}

interface Callbacks {
  readonly onPause?: (record: SpadesDisconnectRecord) => void | Promise<void>;
  readonly onReconnect?: (record: SpadesDisconnectRecord) => void | Promise<void>;
  readonly onTakeover: (record: SpadesDisconnectRecord) => void | Promise<void>;
}

interface PendingDisconnect {
  readonly record: SpadesDisconnectRecord;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Tracks independent 60-second reconnect windows for online Spades seats. */
export class SpadesDisconnectManager {
  private readonly pending = new Map<string, PendingDisconnect>();

  constructor(
    private readonly callbacks: Callbacks,
    private readonly now: () => number = Date.now,
  ) {}

  disconnect(gameId: string, playerId: string, seat: SpadesSeat): SpadesDisconnectRecord {
    const key = this.key(gameId, playerId);
    const existing = this.pending.get(key);
    if (existing) return existing.record;

    const disconnectedAt = this.now();
    const record = {
      gameId,
      playerId,
      seat,
      disconnectedAt,
      takeoverAt: disconnectedAt + SPADES_RECONNECT_GRACE_MS,
    };
    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.callbacks.onTakeover(record);
    }, SPADES_RECONNECT_GRACE_MS);
    this.pending.set(key, { record, timer });
    void this.callbacks.onPause?.(record);
    return record;
  }

  reconnect(gameId: string, playerId: string): boolean {
    const key = this.key(gameId, playerId);
    const entry = this.pending.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(key);
    void this.callbacks.onReconnect?.(entry.record);
    return true;
  }

  getPending(gameId: string): readonly SpadesDisconnectRecord[] {
    return [...this.pending.values()]
      .map(({ record }) => record)
      .filter((record) => record.gameId === gameId);
  }

  isPaused(gameId: string): boolean {
    return this.getPending(gameId).length > 0;
  }

  clearPlayer(gameId: string, playerId: string): void {
    const key = this.key(gameId, playerId);
    const entry = this.pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(key);
  }

  clearGame(gameId: string): void {
    for (const record of this.getPending(gameId)) this.clearPlayer(gameId, record.playerId);
  }

  private key(gameId: string, playerId: string): string {
    return `${gameId}:${playerId}`;
  }
}
