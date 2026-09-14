import { test, expect, type Page } from "@playwright/test";
import { seedFlipGame, flipGameUrl } from "./flip-helpers";

/**
 * #498 audit — the compass-layout mechanism (TableSeating.tsx) already
 * shipped via #423; this suite is the "verify by rendering, not by reasoning
 * about the CSS" half the issue asks for, against constraints nothing
 * exercised before: 400px overflow, PlaySurface's 16° tilt (#442), and a
 * mid-round leave crossing the opponent-count lookup table's boundary.
 *
 * `[data-testid^="seat-"]` collides between SeatRail's `<li>` (playerId) and
 * TableSeating's own seat `<div>` (also playerId) — every locator here is
 * scoped under `[data-testid="table-seating"]` to avoid matching both.
 */

function tableSeats(page: Page) {
  return page.locator('[data-testid="table-seating"] [data-testid^="seat-"]');
}

interface SeatGeometry {
  testId: string;
  isLocal: boolean;
  box: { x: number; y: number; width: number; height: number };
}

async function seatGeometry(page: Page): Promise<SeatGeometry[]> {
  const seats = tableSeats(page);
  const count = await seats.count();
  const entries: SeatGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const seat = seats.nth(i);
    const box = await seat.boundingBox();
    if (!box) continue;
    const testId = await seat.getAttribute("data-testid");
    const text = await seat.innerText();
    entries.push({ testId: testId ?? "", isLocal: text.includes("You"), box });
  }
  return entries;
}

test.describe("Flip — seat-around-the-table layout audit (#498)", () => {
  for (const playerCount of [3, 4, 5] as const) {
    test(`${playerCount} players: local hand renders below every opponent seat, tilted (default) and flat`, async ({
      page,
    }) => {
      const seed = await seedFlipGame(playerCount);
      await page.goto(flipGameUrl(seed));
      await expect(page.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

      const tilted = await seatGeometry(page);
      const localTilted = tilted.find((e) => e.isLocal);
      const opponentsTilted = tilted.filter((e) => !e.isLocal);
      expect(localTilted, "local seat must be present").toBeTruthy();
      expect(opponentsTilted).toHaveLength(playerCount - 1);
      expect(await page.getByTestId("play-surface").getAttribute("data-tilted")).toBe("true");
      for (const opp of opponentsTilted) {
        expect(
          localTilted!.box.y,
          `local seat (y=${localTilted!.box.y}) must render below opponent ${opp.testId} (y=${opp.box.y}) while tilted`,
        ).toBeGreaterThan(opp.box.y);
      }

      // #442 — the surface's rotateX(16deg) applies a real 3D transform;
      // boundingBox() reports the actual post-transform on-screen geometry,
      // so this is a genuine second measurement, not the same assertion
      // twice. Positions that only happen to read correctly flat, or only
      // tilted, are exactly the failure #498 flags this constraint for.
      await page.getByRole("button", { name: "Flatten table" }).click();
      await expect(page.getByTestId("play-surface")).toHaveAttribute("data-tilted", "false");
      const flat = await seatGeometry(page);
      const localFlat = flat.find((e) => e.isLocal);
      const opponentsFlat = flat.filter((e) => !e.isLocal);
      expect(localFlat).toBeTruthy();
      expect(opponentsFlat).toHaveLength(playerCount - 1);
      for (const opp of opponentsFlat) {
        expect(
          localFlat!.box.y,
          `local seat (y=${localFlat!.box.y}) must render below opponent ${opp.testId} (y=${opp.box.y}) while flat`,
        ).toBeGreaterThan(opp.box.y);
      }
    });
  }

  for (const playerCount of [3, 4, 5] as const) {
    test(`${playerCount} players at 400px: no page-level horizontal overflow, every card stays visible`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 400, height: 800 });
      const seed = await seedFlipGame(playerCount);
      await page.goto(flipGameUrl(seed));
      await expect(page.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow, "no page-level horizontal scroll at 400px").toBe(false);

      // #498 — hands must never collapse to a count; every dealt card stays
      // an actual rendered, nonzero-size element.
      const cards = page.locator('[data-testid="table-seating"] [data-testid^="card-"]');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThan(0);
      for (let i = 0; i < cardCount; i++) {
        const box = await cards.nth(i).boundingBox();
        expect(box, `card ${i} must be measurable (rendered, not display:none)`).not.toBeNull();
        expect(box!.width, `card ${i} must have nonzero width`).toBeGreaterThan(0);
        expect(box!.height, `card ${i} must have nonzero height`).toBeGreaterThan(0);
      }
    });
  }

  // #434's leave path crosses TableSeating's OPPONENT_POSITIONS lookup table
  // at its most fragile point: a lookup keyed on opponent count changes KEY
  // (4 -> 3) rather than just shrinking an existing arrangement, which is
  // exactly the shape of change a hardcoded per-count layout could get
  // wrong. Two independent browser contexts, same pattern flip-leave.spec.ts
  // established: a second `page` in the same context would share the first
  // player's session, not prove a genuinely separate connection.
  test("a mid-round leave crossing the 4->3 opponent boundary re-renders without a gap or crash", async ({
    page,
    browser,
  }) => {
    const seed = await seedFlipGame(5);
    const dev = seed.players[0]!;
    const alice = seed.players[1]!;

    await page.goto(flipGameUrl(seed, dev.name, dev.profileId));
    await expect(page.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });
    await expect(tableSeats(page)).toHaveCount(5);

    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    await alicePage.goto(flipGameUrl(seed, alice.name, alice.profileId));
    await expect(alicePage.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

    try {
      await alicePage.getByRole("button", { name: "Leave" }).click();
      await alicePage.getByRole("alertdialog").getByRole("button", { name: "Leave" }).click();
      await expect(alicePage).not.toHaveURL(/\/game\//, { timeout: 10_000 });

      // Dev's page: TableSeating drops the departed seat entirely (FlipTable
      // filters status !== 'left' before it ever reaches TableSeating) —
      // one fewer seat, not a blank/broken one, and the remaining seats
      // must still be real, positioned, visible elements.
      await expect(tableSeats(page)).toHaveCount(4, { timeout: 10_000 });
      const afterLeave = await seatGeometry(page);
      const local = afterLeave.find((e) => e.isLocal);
      const opponents = afterLeave.filter((e) => !e.isLocal);
      expect(local, "local seat survives the departure").toBeTruthy();
      expect(opponents).toHaveLength(3);
      for (const opp of opponents) {
        expect(opp.box.width, `remaining opponent ${opp.testId} must still have real geometry`).toBeGreaterThan(0);
        expect(local!.box.y).toBeGreaterThan(opp.box.y);
      }
    } finally {
      await aliceContext.close().catch(() => {});
    }
  });
});
