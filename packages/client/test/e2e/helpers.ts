import { request, type Page, type Locator } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export interface SeedResult {
  joinCode: string;
  profileId: string;
  playerName: string;
  mission: number;
}

/**
 * Seeds a fully active 4-player game (Dev + Alice + Bob + Carol) via the
 * server's /dev/seed endpoint. startGame + completeSetup have already run,
 * and every player's wires already have info tokens (full knowledge).
 * Only "Dev" (the returned profileId) has a real profile — Alice/Bob/Carol
 * are joined without a profileId, so only Dev has a usable WS identity.
 */
export async function seedGame(mission = 1): Promise<SeedResult> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post("/dev/seed", { data: { mission } });
  if (!res.ok()) throw new Error(`Seed failed: ${res.status()}`);
  return res.json();
}

export async function cleanupGame(joinCode: string): Promise<void> {
  // Requires daring-bobcat's /dev/cleanup endpoint to delete orphaned dev games.
  const ctx = await request.newContext({ baseURL: API_URL });
  await ctx.post("/dev/cleanup", { data: { joinCode } }).catch(() => {});
}

export function gameUrl({ joinCode, profileId, playerName }: SeedResult): string {
  return `${BASE_URL}/game/${joinCode}?profileId=${profileId}&playerName=${encodeURIComponent(playerName)}`;
}

export async function advanceTurn(joinCode: string): Promise<{ currentTurnPlayerId: string; playerName: string }> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post("/dev/advance-turn", { data: { joinCode } });
  if (!res.ok()) throw new Error(`Advance turn failed: ${res.status()}`);
  return res.json();
}

/**
 * Finds two wires in the LOCAL player's own rack (always rendered first —
 * see GameBoard.tsx's sortedPlayers) that share the same displayed value.
 * Own wire values are always visible (state-broadcaster.ts's buildPlayerView
 * only redacts OTHER players' hidden wires), so this only needs DOM reads —
 * no server-side knowledge of the random /dev/seed deal is required.
 * Returns null if no duplicate-value pair exists in the current deal.
 */
export async function findLocalDuplicateValuePair(
  page: Page,
): Promise<{ value: string; wires: [Locator, Locator] } | null> {
  const rack = page.locator('[data-testid="player-rack"]').first();
  const wireButtons = rack.locator("button[data-wire-position]");
  const count = await wireButtons.count();

  const byValue = new Map<string, Locator[]>();
  for (let i = 0; i < count; i++) {
    const btn = wireButtons.nth(i);
    const valueText = (
      await btn.locator("span.text-lg.font-bold").textContent().catch(() => null)
    )?.trim();
    if (!valueText) continue;
    const existing = byValue.get(valueText) ?? [];
    existing.push(btn);
    byValue.set(valueText, existing);
  }

  for (const [value, btns] of byValue) {
    if (btns.length >= 2) return { value, wires: [btns[0], btns[1]] };
  }
  return null;
}
