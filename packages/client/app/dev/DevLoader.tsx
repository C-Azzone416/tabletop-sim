"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export function DevLoader() {
  const router = useRouter();
  const [mission, setMission] = useState(1);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");

  const [advanceJoinCode, setAdvanceJoinCode] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [advanceResult, setAdvanceResult] = useState("");
  const [advanceError, setAdvanceError] = useState("");

  async function handleSeed() {
    setSeeding(true);
    setSeedError("");
    try {
      const res = await fetch(`${SERVER_URL}/dev/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission }),
      });
      if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
      const { joinCode, profileId, playerName } = await res.json();
      await signIn("credentials", { name: playerName, redirect: false });
      router.push(
        `/game/${joinCode}?profileId=${profileId}&playerName=${encodeURIComponent(playerName)}`
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
        headers: { "Content-Type": "application/json" },
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
