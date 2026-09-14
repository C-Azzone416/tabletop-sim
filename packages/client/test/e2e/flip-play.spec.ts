import { test, expect, type Page, type Locator } from "@playwright/test";
import { seedFlipGame, flipGameUrl, switchToSeat, waitForTurnToPass, shoeCount, errorToast } from "./flip-helpers";

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
 * - "A tie at 200+ resolves on highest final-round score" has no test.
 *   near-200 (used below) only stacks ONE player's shoe card — the other
 *   leader's draw is unstacked/random, so there is no #370 scenario that
 *   constructs an exact live tie. The tie-break rule itself is exhaustively
 *   covered at the engine level (packages/games/flip/test/game.test.ts:
 *   "breaks a tie at 200+ by the highest score in the final round" and
 *   "plays another full round when still tied").
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
    // No scenario: the plain seed runs the REAL opening path (#400 —
    // startFlipGame then startRound), so the first dealer is chosen AT RANDOM
    // exactly as in a real game. This used to assume seat 0, which was true
    // only while the seed built state directly; #400 changed that and made
    // this test a coin flip at two players (#416).
    //
    // #436 raised Flip's floor to 3, so this is 3 seats now, not 2 — dealer
    // rotation is `(dealerIndex + 1) % players.length` (game.ts), so "the
    // other seat" no longer uniquely identifies the next dealer. Compute
    // the actual turn order from the seed's own player array instead of
    // assuming a binary dealer/other split.
    const seed = await seedFlipGame(3);
    const dealerIndex = seed.players.findIndex((p) => p.name === seed.dealerName);
    expect(dealerIndex, "seed must report which seat is dealing").toBeGreaterThanOrEqual(0);
    const dealer = seed.players[dealerIndex]!;
    const nextDealer = seed.players[(dealerIndex + 1) % seed.players.length]!;
    const thirdSeat = seed.players[(dealerIndex + 2) % seed.players.length]!;

    await page.goto(flipGameUrl(seed));
    await expect(page.getByTestId("play-surface")).toBeVisible();
    await expect(seatByName(page, dealer.name)).toContainText("Dealer");

    // Freeze every seat in turn order (dealer's left first) — deterministic
    // (score 0 either way) regardless of what got dealt, so the round ends
    // without depending on any card outcome.
    for (const seat of [nextDealer, thirdSeat, dealer]) {
      await switchToSeat(page, seat.name);
      await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
      await page.getByRole("button", { name: "Freeze" }).click();
      if (seat !== dealer) await waitForTurnToPass(page, seat.name);
    }

    // awaiting-round-start doesn't render SeatRail at all (FlipGameRoot
    // shows only the dealer prompt/Start Round button in this phase) — the
    // dealer-rotation check has to happen once FlipTable is back, after
    // round 2 starts.
    await expect(page.getByTestId("flip-awaiting-round-start")).toBeVisible();
    await switchToSeat(page, nextDealer.name);
    await expect(page.getByRole("button", { name: "Start Round" })).toBeVisible();
    await page.getByRole("button", { name: "Start Round" }).click();
    await expect(page.getByTestId("flip-awaiting-round-start")).toHaveCount(0);
    await expect(page.getByTestId("play-surface")).toBeVisible();

    // Dealer rotated one seat left, to the player immediately after the
    // round-1 dealer in seat order.
    await expect(seatByName(page, nextDealer.name)).toContainText("Dealer");
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
    // Shoe count right after Alice's own Hit (which drew the Flip 3 card
    // itself) — the baseline the target's cards get dealt out of.
    const shoeBeforeTarget = await shoeCount(page);
    await page.getByTestId("flip-target-picker").getByRole("button", { name: bob.name }).click();

    // Busted: Bob's hand is cleared and the seat shows the Busted badge.
    await expect(seatByName(page, bob.name)).toContainText("Busted");
    // The real assertion for "only the busting card was ever dealt": the
    // shoe dropped by exactly 1, not 3. A regression that dealt all 3
    // cards before applying the bust would leave an identical Busted/empty
    // hand but a shoe count 2 lower than this.
    await expect(async () => {
      expect(await shoeCount(page)).toBe(shoeBeforeTarget - 1);
    }).toPass();
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
    // #436 raised Flip's floor to 3; this scenario only ever touches seat
    // index 1 (see flip-scenario-states.ts), so the extra seat is inert.
    const seed = await seedFlipGame(3, "second-chance-save");
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
    // #436 raised Flip's floor to 3; the scenario freezes the 3rd seat so
    // the alternating Alice/Dev turn order below still holds exactly.
    const seed = await seedFlipGame(3, "deck-exhaustion");
    const dev = seed.players[0]!;
    const alice = seed.players[1]!;
    const turnOrder = [alice, dev, alice, dev];

    await page.goto(flipGameUrl(seed));
    // #455 — the first 3 hits (draining the shoe) are driven and confirmed
    // BEFORE the 4th (post-reshuffle) hit is ever sent, not just before this
    // point in the script: firing all 4 clicks in one loop with no pause
    // raced the 4th hit's response against the "shoe genuinely reached 0"
    // check below, since both could land in the same or adjacent renders —
    // an intermittent failure under any real latency, not the flake this
    // fix addresses. waitForTurnToPass after every one of the first 3 hits
    // (not skipping the 3rd) is what pins the boundary in place.
    const [first, second, third, fourth] = turnOrder;
    for (const player of [first!, second!, third!]) {
      await switchToSeat(page, player.name);
      await expect(page.getByRole("button", { name: "Hit" })).toBeVisible();
      await page.getByRole("button", { name: "Hit" }).click();
      await waitForTurnToPass(page, player.name);
    }

    // The first 3 hits must have genuinely drained the shoe — the whole
    // scenario is meaningless if it didn't actually reach 0 here. Checked
    // BEFORE the 4th hit is sent, not racing against it.
    await expect(async () => expect(await shoeCount(page)).toBe(0)).toPass();

    await switchToSeat(page, fourth!.name);
    await expect(page.getByRole("button", { name: "Hit" })).toBeVisible();
    await page.getByRole("button", { name: "Hit" }).click();
    // Not waiting for the turn to pass here: if the reshuffle-on-empty-shoe
    // path broke, the action is rejected and this player's turn never
    // passes — waiting for it would hang on a timeout instead of failing on
    // the explicit, immediate check below.

    // #455 — this assertion block used to also pin down WHICH card the 4th
    // (post-reshuffle) draw produced: a grown hand or a bust, nothing else.
    // But the deck-exhaustion scenario's discard is deliberately the
    // unshuffled REST OF THE CANONICAL DECK, action cards included, and the
    // engine's reshuffle-on-empty genuinely shuffles it — so the card drawn
    // right after a reshuffle is authentically random by design. Roughly one
    // run in five it was a Freeze or Flip 3, which neither grows the hand
    // nor busts (it opens a pending target choice instead), making the old
    // assertion flake on a legitimate outcome it just didn't enumerate.
    //
    // This test's own name is about the discard reshuffling back in mid-
    // round, not about what card comes next — so it now asserts exactly
    // that (the shoe count jumping from 0 back up, which is only possible
    // via a genuine reshuffle) plus that the Hit action actually completed,
    // accepting every legitimate completion instead of just two of the
    // three (grew, busted, or paused on a drawn Freeze/Flip 3 awaiting its
    // target). Still exercises the real reshuffle-on-empty path — nothing
    // here fakes or bypasses it, only the claim about the specific next
    // draw is narrowed to what the test is actually named for.
    //
    // If the reshuffle path is broken instead, drawFromShoe throws "cannot
    // draw: shoe and discard are both empty" — not on the safe-error
    // allowlist, so it collapses to a generic "Internal error" toast rather
    // than "Not your turn". The explicit toast check below still catches
    // that regression regardless of which of the three outcomes fired.
    await expect(async () => {
      const busted = await seatByName(page, dev.name).getByText("Busted").isVisible();
      // Currently viewing as Dev (the last switchToSeat in the loop above),
      // so his own label reads "You" — handOf(dev.name) would look for the
      // literal name, which no longer renders while it's his own view.
      const handCount = await myHand(page).locator('[data-testid^="card-"]').count();
      const awaitingTarget = await page.getByTestId("flip-pending-action-picker").isVisible();
      expect(busted || handCount === 2 || awaitingTarget).toBe(true);
    }).toPass();
    await expect(errorToast(page)).toHaveCount(0);
    await expect(page.getByTestId("flip-awaiting-round-start")).toHaveCount(0);

    // The direct, deterministic proof the discard reshuffled back in: the
    // shoe went from genuinely empty to holding the rest of the deck minus
    // whatever the 4th draw just took. This is true regardless of which of
    // the three outcomes above fired — a reshuffle is the only way any of
    // them could have happened at all from an empty shoe.
    await expect(async () => expect(await shoeCount(page)).toBeGreaterThan(0)).toPass();
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

test.describe("Flip — fixed-overlay layout (#450)", () => {
  // #450 — both regressions here passed every existing assertion:
  // JoinCodeBadge and the DevPanel toggle are `fixed`-positioned siblings
  // GameClient renders independently of FlipTable's own layout, so nothing
  // about their presence or text content was ever wrong — `toBeVisible()`
  // is satisfied by an element sitting directly on top of another one.
  // Only comparing bounding boxes catches a visual collision; asserting on
  // DOM presence/text, which is all the rest of this suite does, cannot.
  //
  // Covers every seat count (2-5, the full range #439 is deciding whether
  // to extend) at both a phone width (400px, the acceptance criterion) and
  // a desktop width — the two overlaps in #450 needed different amounts of
  // top clearance to clear at different counts, so a single width/count
  // combination isn't enough to guard the fix.
  async function noOverlap(a: Locator, b: Locator): Promise<void> {
    const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
    expect(boxA, "first element must be visible/measurable").not.toBeNull();
    expect(boxB, "second element must be visible/measurable").not.toBeNull();
    const overlaps = !(
      boxA!.x + boxA!.width <= boxB!.x ||
      boxB!.x + boxB!.width <= boxA!.x ||
      boxA!.y + boxA!.height <= boxB!.y ||
      boxB!.y + boxB!.height <= boxA!.y
    );
    expect(overlaps, `expected no overlap between ${JSON.stringify(boxA)} and ${JSON.stringify(boxB)}`).toBe(false);
  }

  for (const viewport of [
    { width: 400, height: 800, label: "400px phone width" },
    { width: 1280, height: 900, label: "1280px desktop" },
  ]) {
    // #449 raised Flip's registry floor to 3 (2 is no longer a legal
    // playerCount for /dev/seed's gameType: "flip") — narrowed from the
    // original 2-5, not silently dropping the 2-player case: it's simply
    // unreachable for Flip now. Still every count Flip actually seats.
    for (const playerCount of [3, 4, 5] as const) {
      test(`${playerCount} players at ${viewport.label}: Join Code badge and DevPanel toggle don't cover a seat chip or card`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const seed = await seedFlipGame(playerCount);
        await page.goto(flipGameUrl(seed));
        await expect(page.getByTestId("seat-rail")).toBeVisible();

        const joinCodeBadge = page.getByText(/^Join Code:/);
        const devToggle = page.getByRole("button", { name: "Open dev tools" });
        const seatChips = page.locator('ul[data-testid="seat-rail"] > li');
        const tableCards = page.locator('[data-testid="table-seating"] [data-testid^="seat-"]');

        const chipCount = await seatChips.count();
        for (let i = 0; i < chipCount; i++) {
          await noOverlap(joinCodeBadge, seatChips.nth(i));
        }

        const cardCount = await tableCards.count();
        for (let i = 0; i < cardCount; i++) {
          await noOverlap(devToggle, tableCards.nth(i));
        }
      });
    }
  }
});
