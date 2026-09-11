import { request, type Locator, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export interface FlipSeedPlayer {
  name: string;
  profileId: string;
}

export interface FlipSeedResult {
  joinCode: string;
  profileId: string;
  playerName: string;
  gameType: "flip";
  scenario: string | null;
  turnPlayerId: string;
  /**
   * #416 — who is dealing. Read this; do NOT assume seat 0.
   *
   * A plain seed goes through the real path (#400), and the engine picks the
   * first dealer at random, exactly as a real game does. Assuming
   * `players[0]` was the dealer made a test 50% flaky.
   */
  dealerId: string | null;
  dealerName: string | null;
  players: FlipSeedPlayer[];
}

/**
 * Seeds a Flip game via POST /dev/seed.
 *
 * Omit `scenario` for a fresh just-dealt table — that path runs the real
 * startFlipGame/startRound (#400), so the DEALER IS RANDOM and the deal can
 * legitimately pause on an action card. Read `dealerName` rather than
 * assuming a seat.
 *
 * Pass one of #370's eight scenario names for a deterministic table set up on
 * one exact case; those stack the shoe and are reproducible.
 */
export async function seedFlipGame(playerCount: number, scenario?: string): Promise<FlipSeedResult> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const body: Record<string, unknown> = { gameType: "flip", playerCount };
  if (scenario) body.scenario = scenario;
  const res = await ctx.post("/dev/seed", { data: body });
  if (!res.ok()) throw new Error(`Flip seed failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/**
 * Game URL with every seeded player's profileId carried in `seatOptions`
 * (same convention as the wire game's gameUrlWithSeats) so the DevPanel
 * seat switcher can re-authenticate as any of them.
 *
 * #410: also opts out of DevPanel's follow-the-acting-seat default. This
 * suite drives named seats deterministically via switchToSeat — auto-follow
 * is a convenience for a human keeping a solo-driven game moving, not what
 * a test asking for seat X and expecting to land on seat X wants. The
 * product default stays on; only the driven test client opts out.
 */
export function flipGameUrl(seed: FlipSeedResult, name = seed.playerName, profileId = seed.profileId): string {
  const seats = seed.players.map((p) => ({ name: p.name, profileId: p.profileId }));
  return `${BASE_URL}/game/${seed.joinCode}?profileId=${profileId}&playerName=${encodeURIComponent(
    name,
  )}&seatOptions=${encodeURIComponent(JSON.stringify(seats))}&followActingSeat=0`;
}

/**
 * Waits for a just-acted seat's "active" (its turn) indicator to clear,
 * confirming the server has processed the action and broadcast the turn
 * change — before switching to another seat and acting as them, which
 * otherwise races a still-in-flight action (the new seat's Hit/Freeze
 * buttons render off `isMyTurn`, computed from state that may not have
 * updated yet).
 */
export async function waitForTurnToPass(page: Page, actedPlayerName: string): Promise<void> {
  await page
    .locator('li[data-testid^="seat-"][data-active="true"]')
    .filter({ hasText: actedPlayerName })
    .waitFor({ state: "detached" });
}

/**
 * Opens the DevPanel (if collapsed) and switches to the named seat.
 *
 * Waits for the panel's "Viewing: <name>" label to confirm the switch before
 * returning — GameClient disconnects and re-opens a WebSocket on a seat
 * switch (see its `activeSeat` effect), and clicking an action immediately
 * after can otherwise still be in flight on the outgoing connection,
 * producing a server-side "Not your turn" (or a UI race where the clicked
 * button is mid-unmount as the reconnect's fresh state arrives).
 *
 * #410 note: this suite deliberately drives named seats, so flipGameUrl
 * opts every game out of the new follow-the-acting-seat default (see its
 * own doc comment) — this helper's manual-switch semantics are otherwise
 * unchanged.
 */
export async function switchToSeat(page: Page, name: string): Promise<void> {
  const openToggle = page.getByRole("button", { name: "Open dev tools" });
  if (await openToggle.isVisible().catch(() => false)) {
    await openToggle.click();
  }
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByText(`Viewing: ${name}`).waitFor();
  // The label above is client-side state, set synchronously on click — it
  // does not guarantee the new WebSocket has finished authenticating and
  // registering server-side yet. A short, deliberate settle window rather
  // than a tighter signal: there's no client-visible event for "reconnect
  // fully registered" to wait on instead.
  await page.waitForTimeout(800);
}

/** Parses the shoe count out of CardsRemaining's "N card(s) left in the shoe" text. */
export async function shoeCount(page: Page): Promise<number> {
  const text = await page.getByTestId("cards-remaining").innerText();
  const match = text.match(/(\d+)/);
  if (!match) throw new Error(`Could not parse a shoe count out of "${text}"`);
  return Number(match[1]);
}

/** Locates the error toast (ErrorToast.tsx) if one is showing, regardless of its message. */
export function errorToast(page: Page): Locator {
  return page.getByLabel("Dismiss error");
}
