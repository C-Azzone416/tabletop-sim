"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { GAME_REGISTRY, type GameId } from "@tabletop/shared";
import { SERVER_URL, apiHeaders } from "../lib/serverApi";

interface FlipScenario {
  name: string;
  summary: string;
}

// #370 gave /dev/seed a gameType branch for 'flip' only — every other
// registered id still falls through to the Wire mission-seed path
// regardless of what gameType it's told, which would silently mislabel a
// game (#385/#384). So this UI only offers ids the endpoint actually
// branches on, not every GAME_REGISTRY entry — Spades stays off this list
// until seedDevGame grows a branch for it, even though it's registered.
const DEV_SEEDABLE_IDS: readonly GameId[] = ["wire-game", "flip"];

export function DevLoader() {
  const router = useRouter();
  const seedableGames = useMemo(
    () => GAME_REGISTRY.filter((g) => DEV_SEEDABLE_IDS.includes(g.id)),
    [],
  );
  const [gameType, setGameType] = useState<GameId>("wire-game");
  const [mission, setMission] = useState(1);
  const flipEntry = GAME_REGISTRY.find((g) => g.id === "flip")!;
  const [flipPlayerCount, setFlipPlayerCount] = useState(
    Math.min(4, flipEntry.maxPlayers),
  );
  const [flipScenario, setFlipScenario] = useState("");
  const [flipScenarios, setFlipScenarios] = useState<FlipScenario[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");

  const [advanceJoinCode, setAdvanceJoinCode] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [advanceResult, setAdvanceResult] = useState("");
  const [advanceError, setAdvanceError] = useState("");

  // Catalogue-only fetch (#370's GET /dev/flip-scenarios) — populates the
  // dropdown before an engine exists to actually run one, per that route's
  // own comment. Fetched once; the list doesn't change at runtime.
  useEffect(() => {
    fetch(`${SERVER_URL}/dev/flip-scenarios`, { headers: apiHeaders() })
      .then((res) => (res.ok ? res.json() : { scenarios: [] }))
      .then((data) => setFlipScenarios(data.scenarios ?? []))
      .catch(() => setFlipScenarios([]));
  }, []);

  async function handleSeed() {
    setSeeding(true);
    setSeedError("");
    try {
      const body =
        gameType === "flip"
          ? {
              gameType: "flip",
              playerCount: flipPlayerCount,
              scenario: flipScenario || undefined,
            }
          : { mission };

      const res = await fetch(`${SERVER_URL}/dev/seed`, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
      const { joinCode, profileId, playerName, players } = await res.json();
      await signIn("credentials", { name: playerName, redirect: false });
      const seatOptions = encodeURIComponent(JSON.stringify(players ?? []));
      router.push(
        `/game/${joinCode}?profileId=${profileId}&playerName=${encodeURIComponent(playerName)}&seatOptions=${seatOptions}`
      );
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Seed failed");
      setSeeding(false);
    }
  }

  async function handleAdvance() {
    setAdvancing(true);
    setAdvanceResult("");
    setAdvanceError("");
    try {
      const res = await fetch(`${SERVER_URL}/dev/advance-turn`, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ joinCode: advanceJoinCode }),
      });
      if (!res.ok) throw new Error(`Advance failed: ${res.status}`);
      const data = await res.json();
      setAdvanceResult(
        data.currentPlayerName
          ? `Now: ${data.currentPlayerName}'s turn`
          : "Turn advanced"
      );
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : "Advance failed");
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div style={{ padding: 32, fontFamily: "monospace", maxWidth: 480 }}>
      <h1 style={{ marginBottom: 24 }}>Dev Test Panel</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 12 }}>Seed Game</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <label htmlFor="game-type-select">Game:</label>
          <select
            id="game-type-select"
            value={gameType}
            onChange={(e) => setGameType(e.target.value as GameId)}
            style={{ padding: "4px 8px" }}
          >
            {seedableGames.map((g) => (
              <option key={g.id} value={g.id}>
                {g.displayName}
              </option>
            ))}
          </select>
        </div>

        {gameType === "wire-game" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <label htmlFor="mission-select">Mission:</label>
            <select
              id="mission-select"
              value={mission}
              onChange={(e) => setMission(Number(e.target.value))}
              style={{ padding: "4px 8px" }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
                <option key={m} value={m}>
                  Mission {m}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <label htmlFor="flip-players-select">Players:</label>
              <select
                id="flip-players-select"
                value={flipPlayerCount}
                onChange={(e) => setFlipPlayerCount(Number(e.target.value))}
                style={{ padding: "4px 8px" }}
              >
                {Array.from(
                  { length: flipEntry.maxPlayers - flipEntry.minPlayers + 1 },
                  (_, i) => flipEntry.minPlayers + i,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <label htmlFor="flip-scenario-select">Scenario:</label>
              <select
                id="flip-scenario-select"
                value={flipScenario}
                onChange={(e) => setFlipScenario(e.target.value)}
                style={{ padding: "4px 8px" }}
              >
                <option value="">Random deal (no scenario)</option>
                {flipScenarios.map((s) => (
                  <option key={s.name} value={s.name} title={s.summary}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div style={{ marginBottom: 8 }}>
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{ padding: "4px 12px" }}
          >
            {seeding ? "Starting…" : "Seed Game"}
          </button>
        </div>
        {seedError && <p style={{ color: "red" }}>{seedError}</p>}
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>Advance Turn</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <label htmlFor="joincode-input">Join Code:</label>
          <input
            id="joincode-input"
            value={advanceJoinCode}
            onChange={(e) => setAdvanceJoinCode(e.target.value)}
            placeholder="ABC123"
            style={{ padding: "4px 8px", width: 100 }}
          />
          <button
            onClick={handleAdvance}
            disabled={advancing || !advanceJoinCode.trim()}
            style={{ padding: "4px 12px" }}
          >
            {advancing ? "Advancing…" : "Advance Turn"}
          </button>
        </div>
        {advanceResult && <p style={{ color: "green" }}>{advanceResult}</p>}
        {advanceError && <p style={{ color: "red" }}>{advanceError}</p>}
      </section>
    </div>
  );
}
