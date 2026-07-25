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
//
// #222: this route is now own-profile-gated (same #194 pattern as
// /profiles/:id and /games/:joinCode) — profileId/name go as query params,
// same as useWebSocket already sends them. The route can fail two distinct
// ways: 401 (credentials don't resolve to any profile) and 403 (they
// resolve to a different profile than :id) — both leave the picker with no
// data, but they're not the same failure and are logged distinctly rather
// than silently collapsed into one "not ok" case.
export function useMissionOutcomes(
  profileId: string,
  playerName?: string,
  refreshKey?: unknown,
): Record<number, MissionOutcomeResult> {
  const [outcomes, setOutcomes] = useState<
    Record<number, MissionOutcomeResult>
  >({});

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    const params = new URLSearchParams();
    params.set("profileId", profileId);
    if (playerName) params.set("name", playerName);

    fetch(`${SERVER_URL}/profiles/${profileId}/mission-outcomes?${params}`)
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 401) {
          console.error("useMissionOutcomes: 401 — credentials did not resolve to a profile");
        } else if (res.status === 403) {
          console.error("useMissionOutcomes: 403 — credentials resolved to a different profile");
        }
        return null;
      })
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
  }, [profileId, playerName, refreshKey]);

  return outcomes;
}
