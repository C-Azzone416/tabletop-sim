import { test, expect, type Page, type Locator } from "@playwright/test";
import { seedFlipGame, flipGameUrl, switchToSeat, waitForTurnToPass } from "./flip-helpers";

/**
 * #367 — Flip E2E. Targets the local stack in CI, per the existing E2E
 * decision (docs/local-dev.md).
 *
 * Every scenario-driven test uses a #370 stacked-deck scenario
 * (packages/server/src/dev/flip-scenarios.ts) rather than a fresh random
 * deal — that catalogue exists precisely so these cases are one action away
 * instead of unreliable-by-hand. Comments below name the scenario's exact
 * setup (see flip-scenario-states.ts) so a failure is traceable to a wrong
 * assumption about the stacked deck, not a mystery.
 *
 * Seats are located by NAME, not id: /dev/seed's response gives
 * {name, profileId} per seat, not the engine's internal Flip player id that
 * SeatRail's `data-testid="seat-<id>"` uses — profileId and the Flip player
 * id are different values (assigned separately by createGame/joinGame).
 * `seatByName`/`handAfterLabel` below locate elements by their rendered
 * text instead.
 *
 * Flip has no hidden state (#358: design contract C1 does not apply), so
 * every hand is visible to every viewer regardless of whose seat is active
 * — `handOf(page, name)` below reads another player's hand without needing
 * to switch seats; only `myHand(page)` (label "You") needs the local seat.
 *
 * Known, intentional gaps — reported, not silently skipped:
 * - "A bust holding +10 and x2 still scores 0" has no #370 scenario to
 *   drive it live. The bust *path* itself is covered end-to-end by the
 *   flip3-bust test below; the specific modifier-non-doubling arithmetic on
 *   a bust is exhaustively covered in packages/games/flip/test/game.test.ts
 *   at the engine level. Constructing an exact live deck for this via a
 *   fresh (non-scenario) seed isn't possible without control over the
 *   random shoe, which /dev/seed doesn't expose.
 * - "Turn timeout auto-freezes and the table continues" is blocked on #394
 *   (no server-side deadline exists yet — the whole C4 mechanism is
 *   currently inert; filed as its own issue rather than faked here).
 * - Score *values* (round totals, the +15/x2 breakdown) are not asserted
 *   below: FlipScoreboard.tsx isn't mounted in the live route yet (cobra,
 *   in flight). Where a test's job is to prove a scoring rule fired, it
 *   asserts the resulting game-over winner or phase transition instead,
 *   which is observable without the scoreboard.
 */

function seatByName(page: Page, name: string): Locator {
  // `li[data-testid^="seat-"]`, not `[data-testid^="seat-"]` — the latter
  // also matches SeatRail's own container, `data-testid="seat-rail"`.
  return page.locator('li[data-testid^="seat-"]').filter({ hasText: name });
}

/** The Hand (or empty-state) element immediately following a player's name label. */
function handAfterLabel(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
}

const myHand = (page: Page) => handAfterLabel(page, "You");
const handOf = (page: Page, name: string) => handAfterLabel(page, name);

test.describe("Flip — full game, dealer rotation", () => {
  test("a full round passes the deal to the dealer's left", async ({ page }) => {
    // No scenario: buildFlipGameState defaults dealerIndex to 0 (the first
    // seeded player) and deals the opening card queue before returning.
    const seed = await seedFlipGame(2);
    const dealer = seed.players[0]!;
    const other = seed.players[1]!;

    await page.goto(flipGameUrl(seed));
    await expect(page.getByTestId("play-surface")).toBeVisible();
    await expect(seatByName(page, dealer.name)).toContainText("Dealer");

    // Freeze both seats in turn — deterministic (score 0 either way)
    // regardless of what got dealt, so the round ends without depending on
    // any card outcome.
    await switchToSeat(page, other.name);
    await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
    await page.getByRole("button", { name: "Freeze" }).click();
    await waitForTurnToPass(page, other.name);

    await switchToSeat(page, dealer.name);
    await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
    await page.getByRole("button", { name: "Freeze" }).click();

    // awaiting-round-start doesn't render SeatRail at all (FlipGameRoot
    // shows only the dealer prompt/Start Round button in this phase) — the
    // dealer-rotation check has to happen once FlipTable is back, after
    // round 2 starts.
    await expect(page.getByTestId("flip-awaiting-round-start")).toBeVisible();
    await switchToSeat(page, other.name);
    await expect(page.getByRole("button", { name: "Start Round" })).toBeVisible();
    await page.getByRole("button", { name: "Start Round" }).click();
    await expect(page.getByTestId("flip-awaiting-round-start")).toHaveCount(0);
    await expect(page.getByTestId("play-surface")).toBeVisible();

    // Dealer rotated one seat left, to the player who was NOT dealer for round 1.
    await expect(seatByName(page, other.name)).toContainText("Dealer");
    await expect(seatByName(page, dealer.name)).not.toContainText("Dealer");
  });

  test("crossing 200 ends the game for the highest total", async ({ page }) => {
    // near-200: seats 0 and 1 (Dev, Alice) both start at 199 total. Alice
    // (turnPlayerId) already holds a 5; the shoe's next card for her is a 6.
    //
    // A Hit ends the turn immediately (it is not "hit, then also freeze in
    // the same turn") — Alice's own 5+6=11 round only locks in on a LATER
    // turn of hers, once it comes back around: Alice hits (turn -> Bob),
    // Bob freezes at 0 (turn -> Dev), Dev freezes at 0 (only Alice is still
    // active, turn -> Alice again), Alice freezes her accumulated [5,6]=11.
    // Total 199+11=210 crosses 200; Bob (180) and Dev (199) do not.
    const seed = await seedFlipGame(3, "near-200");
    const [dev, alice, bob] = seed.players;

    await page.goto(flipGameUrl(seed));
    await switchToSeat(page, alice!.name);
    await expect(page.getByRole("button", { name: "Hit" })).toBeVisible();
    await page.getByRole("button", { name: "Hit" }).click();
    await waitForTurnToPass(page, alice!.name);

    await switchToSeat(page, bob!.name);
    await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
    await page.getByRole("button", { name: "Freeze" }).click();
    await waitForTurnToPass(page, bob!.name);

    await switchToSeat(page, dev!.name);
    await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
    await page.getByRole("button", { name: "Freeze" }).click();
    await waitForTurnToPass(page, dev!.name);

    await switchToSeat(page, alice!.name);
    await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
    await page.getByRole("button", { name: "Freeze" }).click();

    await expect(page.getByTestId("flip-game-over")).toBeVisible();
    await expect(page.getByTestId("flip-game-over")).toContainText(`${alice!.name} wins!`);
  });
});

test.describe("Flip — Flip 7", () => {
  test("a Flip 7 ends the round immediately", async ({ page }) => {
    // flip7-ready: Alice holds 6 unique numbers (1-6); the shoe's next card
    // for her is a 7 — one Hit completes the set and ends the round.
    const seed = await seedFlipGame(3, "flip7-ready");
    const alice = seed.players[1]!;

    await page.goto(flipGameUrl(seed));
    await switchToSeat(page, alice.name);
    await expect(page.getByRole("button", { name: "Hit" })).toBeVisible();
    await page.getByRole("button", { name: "Hit" }).click();

    // The round ends immediately on the Flip 7 — no further Hit/Freeze
    // choice for anyone, straight to the next round's start prompt.
    await expect(page.getByTestId("flip-awaiting-round-start")).toBeVisible();
  });
});

test.describe("Flip — Flip 3 interruption rulings", () => {
  test("a bust on the Flip 3's first card stops the remaining two from being dealt", async ({ page }) => {
    // flip3-bust: flipper (Alice) draws Flip 3 and targets Bob, who holds a
    // 9; the very next card is another 9 (a bust). The two cards behind it
    // (4, 5) must never reach the table.
    const seed = await seedFlipGame(3, "flip3-bust");
    const alice = seed.players[1]!;
    const bob = seed.players[2]!;

    await page.goto(flipGameUrl(seed));
    await switchToSeat(page, alice.name);
    await page.getByRole("button", { name: "Hit" }).click();

    await expect(page.getByTestId("flip-pending-action-picker")).toBeVisible();
    await page.getByTestId("flip-target-picker").getByRole("button", { name: bob.name }).click();

    // Busted: Bob's hand is cleared and the seat shows the Busted badge —
    // only the busting card (one of the three) was ever dealt.
    await expect(seatByName(page, bob.name)).toContainText("Busted");
    await expect(handOf(page, bob.name).locator('[data-testid^="card-"]')).toHaveCount(0);
  });

  test("a Second Chance save mid-Flip-3 does not stop the remaining cards from being dealt", async ({ page }) => {
    // second-chance-midflip3: flipper (Alice) draws Flip 3 and targets Bob,
    // who holds [9, second-chance]. The next card is another 9 (saved by
    // the Second Chance, NOT a bust) — unlike a real bust, the deal must
    // continue: two more cards (4, 5) still get dealt after the save.
    const seed = await seedFlipGame(3, "second-chance-midflip3");
    const alice = seed.players[1]!;
    const bob = seed.players[2]!;

    await page.goto(flipGameUrl(seed));
    await switchToSeat(page, alice.name);
    await page.getByRole("button", { name: "Hit" }).click();
    await page.getByTestId("flip-target-picker").getByRole("button", { name: bob.name }).click();

    // Bob survives (not busted) and ends with all 3 cards from the Flip 3
    // (the saved 9, plus 4 and 5 dealt after it) plus his starting hand —
    // the Second Chance itself is consumed/discarded, not counted. Every
    // viewer sees Bob's hand (#358, no hidden state) — no seat switch needed.
    await expect(seatByName(page, bob.name)).not.toContainText("Busted");
    await expect(handOf(page, bob.name).locator('[data-testid^="card-"]')).toHaveCount(3);
  });
});

test.describe("Flip — Second Chance (normal, not mid-Flip-3)", () => {
  test("a Second Chance saves a would-be bust: turn ends, no bust recorded", async ({ page }) => {
    // second-chance-save: hero (Alice) holds [9, second-chance]; the next
    // card is another 9. The save discards both the duplicate and the
    // Second Chance, leaving one card and an active (not busted) status.
    const seed = await seedFlipGame(2, "second-chance-save");
    const alice = seed.players[1]!;

    await page.goto(flipGameUrl(seed));
    await switchToSeat(page, alice.name);
    await page.getByRole("button", { name: "Hit" }).click();

    await expect(seatByName(page, alice.name)).not.toContainText("Busted");
    await expect(myHand(page).locator('[data-testid^="card-"]')).toHaveCount(1);
  });
});

test.describe("Flip — deck exhaustion", () => {
  test("the discard reshuffles back in immediately mid-round, no round boundary", async ({ page }) => {
    // deck-exhaustion: hero (Alice) holds [2], the shoe has exactly 3 cards
    // left (3, 4, 5), the rest of the deck sits in the discard, and it's a
    // 2-player table (Alice, Dev). A Hit always ends the turn, so 4 total
    // hits across the table are needed to drain 3 cards and force a 4th
    // draw with nothing left in the shoe — alternating Alice/Dev/Alice/Dev,
    // not 4 in a row from the same seat.
    const seed = await seedFlipGame(2, "deck-exhaustion");
    const dev = seed.players[0]!;
    const alice = seed.players[1]!;
    const turnOrder = [alice, dev, alice, dev];

    await page.goto(flipGameUrl(seed));
    for (const player of turnOrder) {
      await switchToSeat(page, player.name);
      await expect(page.getByRole("button", { name: "Hit" })).toBeVisible();
      await page.getByRole("button", { name: "Hit" }).click();
      await waitForTurnToPass(page, player.name);
    }

    // The 4th Hit (Dev's second) only succeeds if the discard reshuffled
    // in behind the now-empty shoe. No "Not your turn"/engine error toast,
    // and the round is still live (never bounced to awaiting-round-start)
    // — the reshuffle-drawn card may legitimately bust the drawer (it's
    // shuffled), so only phase and absence-of-error are asserted, not a
    // specific hand outcome.
    await expect(page.getByText("Not your turn")).toHaveCount(0);
    await expect(page.getByTestId("flip-awaiting-round-start")).toHaveCount(0);
  });
});

test.describe("Flip — reconnect", () => {
  test("reconnecting mid-round restores the exact table state", async ({ page }) => {
    // Navigate directly as Alice (her own profileId in the URL) rather than
    // switching to her via the DevPanel: a seat switch is client-side-only
    // React state, which a reload discards — reloading would just revert
    // to whichever profileId the URL itself names. That reversion is
    // correct behavior, not what this test is about; testing an actual
    // reconnect for a specific seat means being that seat from the start.
    const seed = await seedFlipGame(3, "flip7-ready");
    const alice = seed.players[1]!;

    await page.goto(flipGameUrl(seed, alice.name, alice.profileId));
    await expect(myHand(page).locator('[data-testid^="card-"]')).toHaveCount(6);

    await page.reload();
    await expect(page.getByTestId("play-surface")).toBeVisible();
    await expect(myHand(page).locator('[data-testid^="card-"]')).toHaveCount(6);
    await expect(seatByName(page, alice.name)).toBeVisible();
  });
});
