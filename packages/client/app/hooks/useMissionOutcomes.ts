"use client";

import { useEffect, useState } from "react";
import type { MissionOutcome, MissionOutcomeResult } from "@tabletop/shared";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

// #170: missions absent from the server response were never played — the
// returned map only ever has entries for missions with a recorded outcome.
// `refreshKey` re-triggers the fetch without changing profileId — GameClient
// passes gameStatus so a win/loss transition picks up the outcome the
// server just wrote (#179's unlock gate needs this to not be stale).
export function useMissionOutcomes(
  profileId: string,
  refreshKey?: unknown,
): Record<number, MissionOutcomeResult> {
  const [outcomes, setOutcomes] = useState<
    Record<number, MissionOutcomeResult>
  >({});

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    fetch(`${SERVER_URL}/profiles/${profileId}/mission-outcomes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { outcomes: MissionOutcome[] } | null) => {
        if (cancelled || !data) return;
        const byMission: Record<number, MissionOutcomeResult> = {};
        for (const o of data.outcomes) {
          byMission[o.mission] = o.outcome;
        }
        setOutcomes(byMission);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [profileId, refreshKey]);

  return outcomes;
}
