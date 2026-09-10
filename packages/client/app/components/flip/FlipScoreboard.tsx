"use client";

// #365 — Flip scoreboard (epic #358). One row per player, cumulative totals
// across rounds, with each round's points explained rather than just summed.
//
// The breakdown is DISPLAY of numbers the engine already awarded — this
// component never computes a score. It reads `total` as the number of record
// and shows the parts alongside it; if the parts are missing (a round scored
// before migration 017) it falls back to the plain total rather than hiding
// the round. Deriving a score here would risk showing Caroline a number that
// disagrees with the engine's.
//
// Props are a local interface rather than engine types on purpose: this keeps
// the component renderable and testable before #360 lands, and swapping in
// real types later is an import change, not a rewrite.

export interface FlipScoreBreakdown {
  numbersSum: number;
  plusSum: number;
  hasX2: boolean;
  /** 15 or 0. Added after the multiplier and never doubled (#358). */
  flip7Bonus: number;
  total: number;
  busted: boolean;
}

export interface FlipRoundScore {
  roundNumber: number;
  score: number;
  busted: boolean;
  flip7: boolean;
  breakdown: FlipScoreBreakdown | null;
}

export interface FlipScoreboardPlayer {
  id: string;
  /** The name they joined the lobby with (#365). */
  name: string;
  rounds: readonly FlipRoundScore[];
}

interface FlipScoreboardProps {
  players: readonly FlipScoreboardPlayer[];
  /** Highlighted as at-or-past the win threshold. */
  winThreshold?: number;
}

export const FLIP_WIN_THRESHOLD = 200;

export function cumulativeTotal(rounds: readonly FlipRoundScore[]): number {
  return rounds.reduce((sum, round) => sum + round.score, 0);
}

/**
 * The one-line explanation of a round, e.g. "12 + 4 ×2" or "18 + 15 bonus".
 * Returns null when there is nothing to explain beyond the total itself —
 * a plain hand with no modifier and no bonus explains itself.
 */
export function describeRound(round: FlipRoundScore): string | null {
  if (round.busted) return "bust";

  const parts = round.breakdown;
  if (!parts) return null;

  const segments: string[] = [];
  if (parts.plusSum > 0) segments.push(`${parts.numbersSum} + ${parts.plusSum}`);
  else segments.push(`${parts.numbersSum}`);

  if (parts.hasX2) segments.push("×2");
  if (parts.flip7Bonus > 0) segments.push(`+ ${parts.flip7Bonus} bonus`);

  // Nothing beyond the bare number sum — the total already says it.
  if (!parts.hasX2 && parts.flip7Bonus === 0 && parts.plusSum === 0) return null;

  return segments.join(" ");
}

export function FlipScoreboard({
  players,
  winThreshold = FLIP_WIN_THRESHOLD,
}: FlipScoreboardProps) {
  const roundNumbers = [
    ...new Set(players.flatMap((p) => p.rounds.map((r) => r.roundNumber))),
  ].sort((a, b) => a - b);

  return (
    <section aria-label="Scoreboard" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
        Scoreboard
      </h3>

      {/* Five players must read without scrolling the play surface (#365), so
          rows stay compact and the per-round detail sits inline under the
          round number rather than in extra columns. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Player
              </th>
              {roundNumbers.map((n) => (
                <th key={n} scope="col" className="px-2 py-1 text-right font-medium">
                  R{n}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const total = cumulativeTotal(player.rounds);
              const hasWon = total >= winThreshold;
              const byRound = new Map(player.rounds.map((r) => [r.roundNumber, r]));

              return (
                <tr key={player.id} className="border-t border-outline">
                  <th scope="row" className="px-2 py-1 text-left font-medium text-ink">
                    {player.name}
                  </th>

                  {roundNumbers.map((n) => {
                    const round = byRound.get(n);
                    if (!round) {
                      return (
                        <td key={n} className="px-2 py-1 text-right text-ink-muted">
                          –
                        </td>
                      );
                    }
                    const detail = describeRound(round);
                    return (
                      <td key={n} className="px-2 py-1 text-right align-top">
                        <span className={round.busted ? "text-ink-muted" : "text-ink"}>
                          {round.score}
                        </span>
                        {detail && (
                          <span className="block text-xs text-ink-muted">{detail}</span>
                        )}
                      </td>
                    );
                  })}

                  <td className="px-2 py-1 text-right font-bold text-ink">
                    {total}
                    {hasWon && (
                      <span
                        className="ml-1 rounded-cab border border-outline bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-muted"
                        title={`At or past ${winThreshold}`}
                      >
                        {winThreshold}+
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
