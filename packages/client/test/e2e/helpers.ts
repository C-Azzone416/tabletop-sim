import { request, type Browser, type Page, type Locator } from "@playwright/test";

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

export interface SoloCutLegalSeedResult extends SeedResult {
  soloCutValue: string;
  soloCutColor: string;
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
 * PR #128's /dev/seed-near-win): finds a matching hidden wire pair in scope,
 * reassigns it to Dev, cuts every other hidden wire, and hands Dev the turn.
 * Lets checklist item 7 (mission win) be driven by a single real solo_cut
 * instead of an unverified multi-identity turn-ordered solver.
 *
 * #256/#253 item 4: pass `{ color: "yellow" }` to position a colour-scoped
 * near-win instead of the default value-matched blue pair. `mission` is
 * left off the request entirely when unset (not defaulted to 1 here) so the
 * server's own yellow-aware default (mission 3, the first with any yellow
 * wires) applies — sending `mission: 1` alongside `color: "yellow"` would
 * always fail, since mission 1 has none.
 */
export async function seedNearWinGame(
  mission?: number,
  options: { color?: "blue" | "yellow" } = {},
): Promise<SeedResult> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const data: Record<string, unknown> = {};
  if (mission !== undefined) data.mission = mission;
  if (options.color) data.color = options.color;
  const res = await ctx.post("/dev/seed-near-win", { data });
  if (!res.ok()) throw new Error(`Seed-near-win failed: ${res.status()}`);
  return res.json();
}

/**
 * Seeds an active game where Dev deterministically holds every wire in a
 * legal solo-cut scope (server PR /dev/seed-solo-cut-legal, #165) — the
 * only way a solo cut is legal per #150's hold-all-remaining rule. Mission
 * 1 splits each value's 4 copies across 4 players, so a random /dev/seed
 * deal gives this by chance with <1% probability; this replaces the old
 * 5-attempt retry+skip loop that mostly skipped instead of exercising the
 * scenario.
 *
 * #256/#253 item 2: pass `{ color: "yellow" }` for the colour-scoped
 * variant — Dev ends up holding every hidden yellow wire in the game
 * (any values), matching #190 Phase B's "must hold all remaining hidden
 * yellow" legality rather than a value match. Same mission-default note as
 * seedNearWinGame above.
 */
export async function seedSoloCutLegalGame(
  mission?: number,
  options: { color?: "blue" | "yellow" } = {},
): Promise<SoloCutLegalSeedResult> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const data: Record<string, unknown> = {};
  if (mission !== undefined) data.mission = mission;
  if (options.color) data.color = options.color;
  const res = await ctx.post("/dev/seed-solo-cut-legal", { data });
  if (!res.ok()) throw new Error(`Seed-solo-cut-legal failed: ${res.status()}`);
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
 * Only checks wires with data-wire-status="hidden" — cut wires also carry
 * a data-wire-value (they're public info per #173), but this helper is
 * hunting for a legal SOLO CUT candidate, which only exists among the
 * player's still-hidden wires. Value is read from data-wire-value (#210),
 * a stable attribute on the wire's own button — not the tile's inner
 * markup, which #200's circular-chip rework for pending info tokens
 * changed the shape/structure of.
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
    const valueText = (await btn.getAttribute("data-wire-value")) ?? undefined;
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
      const infoValue = await wires.nth(i).getAttribute("data-wire-value");
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
 * of the named opponents' racks (via that wire's info token — since
 * /dev/seed pre-places an info token on every wire for every player, an
 * opponent's true hidden value is readable off the wire's own
 * data-wire-value attribute even though the wire itself renders as
 * data-wire-status="hidden"; see Wire.tsx and seedDevGame in
 * packages/server/src/app.ts).
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
    const valueText = (await btn.getAttribute("data-wire-value")) ?? undefined;
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
      const infoValue = await btn.getAttribute("data-wire-value");
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
    const valueText = (await btn.getAttribute("data-wire-value")) ?? undefined;
    if (valueText) localValues.add(valueText);
  }
  if (localValues.size === 0) return null;

  for (const name of opponentNames) {
    const rack = playerContainer(page, name).locator('[data-testid="player-rack"]');
    // No color filter: opponents' hidden-wire colors are redacted (#187).
    // This helper only runs on mission 1, where every wire is blue, so any
    // hidden wire qualifies; the true value still comes from the public
    // info token that /dev/seed's fast-forward places on every wire.
    const wireButtons = rack.locator('button[data-wire-position][data-wire-status="hidden"]');
    const count = await wireButtons.count();
    for (let i = 0; i < count; i++) {
      const wire = wireButtons.nth(i);
      const realValue = await wire.getAttribute("data-wire-value");
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
 *
 * #187 made opponents' hidden-wire colors invisible on the acting player's
 * page (redacted server-side), so this reads each opponent's OWN view —
 * where their colors are legitimately visible to themselves — in a
 * throwaway browser context, notes the wire's public rack position, and
 * targets that position back on the acting player's page.
 */
export async function findOpponentHiddenWireByColor(
  page: Page,
  browser: Browser,
  seed: SeedResult,
  opponentNames: string[],
  color: "blue" | "yellow" | "red",
): Promise<{ wire: Locator; ownerName: string } | null> {
  for (const name of opponentNames) {
    const profile = seed.players.find((p) => p.name === name);
    if (!profile) continue;
    const ctx = await browser.newContext();
    let position: string | null = null;
    try {
      const ownPage = await ctx.newPage();
      await ownPage.goto(gameUrl({ ...seed, profileId: profile.profileId, playerName: name }));
      // NOT [data-testid="player-rack"].first() — that grabs the first
      // player in SEAT order (always Dev/seat 0 in these dev-seeded games),
      // not this viewer's own rack. GameBoard.tsx labels the local player
      // "You"; that's the correct anchor for "this viewer's own rack".
      const ownRack = ownPage
        .getByText("You", { exact: true })
        .locator('xpath=ancestor::div[.//*[@data-testid="player-rack"]][1]')
        .locator('[data-testid="player-rack"]');
      await ownRack.locator("button[data-wire-position]").first().waitFor({ timeout: 10_000 });
      const candidates = ownRack.locator(
        `button[data-wire-color="${color}"][data-wire-status="hidden"]`,
      );
      if ((await candidates.count()) > 0) {
        position = await candidates.first().getAttribute("data-wire-position");
      }
    } finally {
      // Close before the caller opens its own context as this player — two
      // sockets for the same playerId overwrite each other in
      // connection-manager.ts's gameConnections map.
      await ctx.close();
    }
    if (position) {
      const wire = playerContainer(page, name)
        .locator('[data-testid="player-rack"]')
        .locator(`button[data-wire-position="${position}"]`);
      return { wire, ownerName: name };
    }
  }
  return null;
}
