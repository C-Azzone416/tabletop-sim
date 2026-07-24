import { request, type Page, type Locator } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export interface SeedPlayer {
  name: string;
  profileId: string;
}

export interface SeedResult {
  joinCode: string;
  profileId: string;
  playerName: string;
  mission: number;
  players: SeedPlayer[];
}

/**
 * Seeds a 4-player game (Dev + Alice + Bob + Carol) via the server's
 * /dev/seed endpoint. Since the dev-seed-realism change, /dev/seed's default
 * lands the game at the START of the real opening flow — `setup` status,
 * captain's turn, zero info tokens — not the old auto-active/all-knowledge
 * state. Fast-forward defaults to `true` so every existing caller keeps the
 * old assumption (active game, full token knowledge) without changes: this
 * calls the new POST /dev/reveal-all-tokens right after seeding, which
 * completes any remaining setup placement and backfills a token for every
 * wire. Pass `{ fastForward: false }` to get the real, drivable opening
 * flow instead (see setup-flow.spec.ts).
 *
 * Since PR #107, the response's `players` array carries a real profileId for
 * every seeded player (not just Dev), so any of the 4 seats can be driven
 * via gameUrl() + a separate browser context — see multiplayer-sync.spec.ts.
 */
export async function seedGame(
  mission = 1,
  options: { fastForward?: boolean } = {},
): Promise<SeedResult> {
  const { fastForward = true } = options;
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post("/dev/seed", { data: { mission } });
  if (!res.ok()) throw new Error(`Seed failed: ${res.status()}`);
  const result: SeedResult = await res.json();

  if (fastForward) {
    const revealRes = await ctx.post("/dev/reveal-all-tokens", {
      data: { joinCode: result.joinCode },
    });
    if (!revealRes.ok()) {
      throw new Error(`Reveal-all-tokens failed: ${revealRes.status()}`);
    }
  }

  return result;
}

/**
 * Seeds an active game positioned one correct solo cut from victory (server
 * PR #128's /dev/seed-near-win): finds a matching non-red hidden wire pair,
 * reassigns both to Dev, cuts every other hidden wire, and hands Dev the
 * turn. Lets checklist item 7 (mission win) be driven by a single real
 * solo_cut instead of an unverified multi-identity turn-ordered solver.
 */
export async function seedNearWinGame(mission = 1): Promise<SeedResult> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post("/dev/seed-near-win", { data: { mission } });
  if (!res.ok()) throw new Error(`Seed-near-win failed: ${res.status()}`);
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

/**
 * gameUrl plus the dev-only seatOptions query param (see parseSeatOptions.ts),
 * so the DevPanel seat switcher is populated with every seeded player. Kept
 * separate from gameUrl because seatOptions also arms GameClient's #149
 * setup→active auto-seat-follow, which specs driving the setup flow don't
 * expect.
 */
export function gameUrlWithSeats(seed: SeedResult): string {
  const seats = seed.players.map((p) => ({ name: p.name, profileId: p.profileId }));
  return `${gameUrl(seed)}&seatOptions=${encodeURIComponent(JSON.stringify(seats))}`;
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
 *
 * Only checks wires with data-wire-status="hidden" — Wire.tsx only renders
 * the value span (span.text-lg.font-bold) for hidden wires, never for cut
 * ones. Checking the status attribute first (cheap, always present) avoids
 * calling .textContent() against a selector that will never resolve for a
 * cut wire, which would otherwise block for the full (unbounded by default)
 * Playwright action timeout per wire before the .catch() fires — fine when
 * every wire is hidden (the original scenario this was written for), but
 * pathological once some wires are already cut (e.g. a near-win seed).
 *
 * Since #150 (solo-cut hard legality), a candidate pair is only useful if
 * it's actually a LEGAL solo cut — the local player must hold every
 * remaining hidden wire of that value, not just 2 of them. A value is
 * rejected if any named opponent still has a hidden wire of it (readable
 * via that wire's info-token badge — see findDualCutOpportunity's doc
 * comment for why that's visible even though the wire itself is "hidden").
 * opponentNames defaults to the standard /dev/seed 4-player deal.
 */
export async function findLocalDuplicateValuePair(
  page: Page,
  opponentNames: string[] = ["Alice", "Bob", "Carol"],
): Promise<{ value: string; wires: [Locator, Locator] } | null> {
  const rack = page.locator('[data-testid="player-rack"]').first();
  const wireButtons = rack.locator("button[data-wire-position]");
  const count = await wireButtons.count();

  const byValue = new Map<string, Locator[]>();
  for (let i = 0; i < count; i++) {
    const btn = wireButtons.nth(i);
    const status = await btn.getAttribute("data-wire-status");
    if (status !== "hidden") continue;
    const valueText = (
      await btn.locator("span.text-lg.font-bold").textContent().catch(() => null)
    )?.trim();
    if (!valueText) continue;
    const existing = byValue.get(valueText) ?? [];
    existing.push(btn);
    byValue.set(valueText, existing);
  }

  const candidates = [...byValue.entries()].filter(([, btns]) => btns.length >= 2);
  if (candidates.length === 0) return null;

  const opponentHiddenValues = new Set<string>();
  for (const name of opponentNames) {
    const rack = playerContainer(page, name).locator('[data-testid="player-rack"]');
    const wires = rack.locator('button[data-wire-position][data-wire-status="hidden"]');
    const wireCount = await wires.count();
    for (let i = 0; i < wireCount; i++) {
      const infoValue = (
        await wires.nth(i).locator('[data-testid="wire-info-token"]').textContent().catch(() => null)
      )?.trim();
      if (infoValue) opponentHiddenValues.add(infoValue);
    }
  }

  for (const [value, btns] of candidates) {
    if (!opponentHiddenValues.has(value)) return { value, wires: [btns[0], btns[1]] };
  }
  return null;
}

/**
 * Locates the per-player wrapper div (name header + PlayerRack) for a given
 * displayed player name (GameBoard.tsx renders "You" for the local player
 * and the real name for everyone else — so this only resolves opponents).
 * Mirrors the testing-library getRackContainer() pattern used in
 * GameBoard.test.tsx (closest name span → nearest ancestor that also
 * contains a [data-testid="player-rack"] descendant).
 */
export function playerContainer(page: Page, name: string): Locator {
  return page
    .getByText(name, { exact: true })
    .locator(`xpath=ancestor::div[.//*[@data-testid="player-rack"]][1]`);
}

/**
 * Finds a wire value present in BOTH the local player's own rack (values
 * always visible to their owner — see findLocalDuplicateValuePair) and one
 * of the named opponents' racks (via that wire's info token badge — since
 * /dev/seed pre-places an info token on every wire for every player, an
 * opponent's true hidden value is readable from data-testid="wire-info-token"
 * even though the wire itself renders as data-wire-status="hidden"; see
 * Wire.tsx and seedDevGame in packages/server/src/app.ts).
 *
 * A shared value is exactly what's needed to drive a full Dual Cut: the
 * local player can guess the opponent's wire correctly (propose), and — once
 * accepted — complete their half with an own wire of the same value.
 */
export async function findDualCutOpportunity(
  page: Page,
  opponentNames: string[],
): Promise<{
  value: string;
  ownWire: Locator;
  ownWireRackPosition: number;
  targetWire: Locator;
  targetPlayerName: string;
} | null> {
  const localRack = page.locator('[data-testid="player-rack"]').first();
  const localWireButtons = localRack.locator("button[data-wire-position]");
  const localCount = await localWireButtons.count();

  const localByValue = new Map<string, Locator>();
  for (let i = 0; i < localCount; i++) {
    const btn = localWireButtons.nth(i);
    const status = await btn.getAttribute("data-wire-status");
    if (status !== "hidden") continue;
    const valueText = (
      await btn.locator("span.text-lg.font-bold").textContent().catch(() => null)
    )?.trim();
    if (valueText) localByValue.set(valueText, btn);
  }
  if (localByValue.size === 0) return null;

  for (const name of opponentNames) {
    const rack = playerContainer(page, name).locator('[data-testid="player-rack"]');
    const wireButtons = rack.locator("button[data-wire-position]");
    const count = await wireButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = wireButtons.nth(i);
      const status = await btn.getAttribute("data-wire-status");
      if (status !== "hidden") continue;
      const infoValue = (
        await btn.locator('[data-testid="wire-info-token"]').textContent().catch(() => null)
      )?.trim();
      if (infoValue && localByValue.has(infoValue)) {
        const ownWire = localByValue.get(infoValue)!;
        const posAttr = await ownWire.getAttribute("data-wire-position");
        return {
          value: infoValue,
          ownWire,
          ownWireRackPosition: Number(posAttr),
          targetWire: btn,
          targetPlayerName: name,
        };
      }
    }
  }
  return null;
}

/**
 * Finds an opponent's hidden BLUE wire and a value the local player can
 * legitimately (but wrongly) guess against it: a value from one of the
 * local player's own hidden wires that does NOT match the target wire's
 * real value (read via its info-token badge, same technique as
 * findDualCutOpportunity).
 *
 * This distinction matters since #133's propose-time guard
 * (executeProposeDualCut in packages/server/src/engine/game-engine.ts)
 * hard-rejects a blue-wire guess unless the proposer currently holds a
 * hidden wire with that exact value — so a guess constructed without
 * checking the local rack (e.g. cycling the real value by an offset) can
 * intermittently fail that guard and hang waiting for a target prompt that
 * the server never sends.
 */
export async function findDualCutWrongGuessOpportunity(
  page: Page,
  opponentNames: string[],
): Promise<{ wire: Locator; ownerName: string; wrongValue: string } | null> {
  const localRack = page.locator('[data-testid="player-rack"]').first();
  const localWireButtons = localRack.locator("button[data-wire-position]");
  const localCount = await localWireButtons.count();

  const localValues = new Set<string>();
  for (let i = 0; i < localCount; i++) {
    const btn = localWireButtons.nth(i);
    const status = await btn.getAttribute("data-wire-status");
    if (status !== "hidden") continue;
    const valueText = (
      await btn.locator("span.text-lg.font-bold").textContent().catch(() => null)
    )?.trim();
    if (valueText) localValues.add(valueText);
  }
  if (localValues.size === 0) return null;

  for (const name of opponentNames) {
    const rack = playerContainer(page, name).locator('[data-testid="player-rack"]');
    const wireButtons = rack.locator('button[data-wire-color="blue"][data-wire-status="hidden"]');
    const count = await wireButtons.count();
    for (let i = 0; i < count; i++) {
      const wire = wireButtons.nth(i);
      const realValue = (
        await wire.locator('[data-testid="wire-info-token"]').textContent().catch(() => null)
      )?.trim();
      if (!realValue) continue;
      const wrongValue = [...localValues].find((v) => v !== realValue);
      if (wrongValue) {
        return { wire, ownerName: name, wrongValue };
      }
    }
  }
  return null;
}

/**
 * Finds the first hidden wire of the given color owned by one of the named
 * opponents (dual cut cannot target your own wire — see
 * executeProposeDualCut in packages/server/src/engine/game-engine.ts).
 */
export async function findOpponentHiddenWireByColor(
  page: Page,
  opponentNames: string[],
  color: "blue" | "yellow" | "red",
): Promise<{ wire: Locator; ownerName: string } | null> {
  for (const name of opponentNames) {
    const rack = playerContainer(page, name).locator('[data-testid="player-rack"]');
    const wire = rack.locator(
      `button[data-wire-color="${color}"][data-wire-status="hidden"]`,
    ).first();
    if ((await wire.count()) > 0) return { wire, ownerName: name };
  }
  return null;
}
