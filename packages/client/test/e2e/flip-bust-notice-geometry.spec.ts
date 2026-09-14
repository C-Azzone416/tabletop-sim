import { test, expect, type Page } from "@playwright/test";
import { seedFlipGame, flipGameUrl, switchToSeat } from "./flip-helpers";

/**
 * #500 — BustNotice (shipped in #423/#422) had no dedicated 400px geometry
 * coverage. QA flagged it during #499's review: it couldn't force a live
 * bust to fire in the review's time budget, so it assessed the markup
 * instead (structurally identical to LeaveGameWarning/FlipLeaveConfirm/
 * GameOverOverlay, all three already verified at this width) — a reasoned
 * judgement, not a measurement, which is why it was filed rather than
 * waved through.
 *
 * Firing a bust deterministically is done via #370's "flip3-bust" scenario
 * (packages/server/src/dev/flip-scenario-states.ts): the flipper (seat 1)
 * draws the Flip 3 on top of the shoe, targets seat 2, who is then dealt a
 * duplicate of a card already in their hand — an immediate bust. Same
 * sequence flip-play.spec.ts's "a bust on the Flip 3's first card stops the
 * remaining two from being dealt" test already drives; this just adds the
 * geometry assertions that test never needed.
 *
 * #498's own audit already established the seat layout (all four compass
 * edges occupied) holds at 400px in isolation — the risk here is
 * specifically the INTERACTION: BustNotice's full-screen overlay rendered
 * on top of that crowded layout, at the player count with the least room
 * (5), tilted and flat (#442).
 */

async function triggerBustAt5Players(page: Page, flattenFirst: boolean): Promise<void> {
  const seed = await seedFlipGame(5, "flip3-bust");
  const alice = seed.players[1]!;
  const bob = seed.players[2]!;

  await page.goto(flipGameUrl(seed));
  await expect(page.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

  if (flattenFirst) {
    // Must flatten BEFORE the bust fires: BustNotice is a fixed inset-0
    // z-50 overlay that covers the whole viewport once visible, including
    // the "Flatten table" toggle underneath it — there is no reaching it
    // once the notice is up.
    await page.getByRole("button", { name: "Flatten table" }).click();
    await expect(page.getByTestId("play-surface")).toHaveAttribute("data-tilted", "false");
  } else {
    await expect(page.getByTestId("play-surface")).toHaveAttribute("data-tilted", "true");
  }

  await switchToSeat(page, alice.name);
  await page.getByRole("button", { name: "Hit" }).click();
  await expect(page.getByTestId("flip-target-picker")).toBeVisible();
  await page.getByTestId("flip-target-picker").getByRole("button", { name: bob.name }).click();

  await expect(page.getByTestId("bust-notice")).toBeVisible({ timeout: 10_000 });
}

test.describe("Flip — BustNotice geometry at 400px, 5 players (#500)", () => {
  for (const { label, flattenFirst } of [
    { label: "tilted (default)", flattenFirst: false },
    { label: "flattened", flattenFirst: true },
  ]) {
    test(`${label}: no page-level horizontal overflow, dismiss control reachable and inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 400, height: 800 });
      await triggerBustAt5Players(page, flattenFirst);

      // #500 — the interaction risk: BustNotice on top of the seat layout,
      // not the notice in isolation. The seat layout (TableSeating) is
      // still mounted underneath the overlay at this point.
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow, "no page-level horizontal scroll at 400px").toBe(false);

      const notice = page.getByTestId("bust-notice");
      const noticeBox = await notice.boundingBox();
      expect(noticeBox, "the notice itself must be measurable/visible").not.toBeNull();
      expect(noticeBox!.x, "notice must not start off the left edge").toBeGreaterThanOrEqual(0);
      expect(noticeBox!.x + noticeBox!.width, "notice must not extend past the right edge (400px)").toBeLessThanOrEqual(
        400,
      );

      // The dismiss control specifically: a notice that must be explicitly
      // acknowledged but whose dismiss button is unreachable at this width
      // is worse than no notice at all (#500's own framing).
      //
      // Found while verifying this test catches a real break: the notice's
      // wrapper (`fixed inset-0 flex items-center justify-center`) makes
      // horizontal overflow structurally hard to reproduce — a flex child's
      // default flex-shrink:1 shrinks even an explicit width down to fit a
      // narrower container, so widening the notice alone doesn't overflow
      // it. The vertical axis has no such protection (flex only auto-
      // shrinks the main axis, row by default) — a tall notice genuinely
      // pushes the dismiss button below the viewport, which is what
      // actually broke when this was tried as the mutation check.
      const dismissButton = page.getByRole("button", { name: "Got it" });
      await expect(dismissButton).toBeVisible();
      const buttonBox = await dismissButton.boundingBox();
      expect(buttonBox, "dismiss button must be measurable/visible").not.toBeNull();
      expect(buttonBox!.x).toBeGreaterThanOrEqual(0);
      expect(buttonBox!.y).toBeGreaterThanOrEqual(0);
      expect(buttonBox!.x + buttonBox!.width, "dismiss button must not extend past the right edge").toBeLessThanOrEqual(
        400,
      );
      expect(buttonBox!.y + buttonBox!.height, "dismiss button must not extend past the bottom edge").toBeLessThanOrEqual(
        800,
      );

      // Actually reachable, not just geometrically inside the viewport —
      // click it and confirm the notice dismisses.
      await dismissButton.click();
      await expect(notice).toHaveCount(0);
    });
  }
});
