"use client";

import { useState } from "react";
import type { Wire, Player } from "@tabletop/shared";

interface ActionPanelProps {
  isMyTurn: boolean;
  players: Player[];
  wires: Wire[];
  localPlayerId: string;
  doubleDetectorUsed: boolean;
  onDuoCut: (targetWireId: string, guessedValue: string) => void;
  onSoloCut: (wireValue: string) => void;
  onDoubleDetector: (targetWireId: string, targetWireId2: string) => void;
}

type ActionMode = "idle" | "duo_cut" | "solo_cut" | "double_detector";

export function ActionPanel({
  isMyTurn,
  players,
  wires,
  localPlayerId,
  doubleDetectorUsed,
  onDuoCut,
  onSoloCut,
  onDoubleDetector,
}: ActionPanelProps) {
  const [mode, setMode] = useState<ActionMode>("idle");
  const [selectedWire1, setSelectedWire1] = useState<string | null>(null);
  const [selectedWire2, setSelectedWire2] = useState<string | null>(null);
  const [guessedValue, setGuessedValue] = useState("");

  if (!isMyTurn) return null;

  const otherPlayerWires = wires.filter(
    (w) => w.playerId !== localPlayerId && w.status === "hidden"
  );
  const myWires = wires.filter(
    (w) => w.playerId === localPlayerId && w.status === "hidden"
  );

  const reset = () => {
    setMode("idle");
    setSelectedWire1(null);
    setSelectedWire2(null);
    setGuessedValue("");
  };

  const handleSubmitDuoCut = () => {
    if (selectedWire1 && guessedValue) {
      onDuoCut(selectedWire1, guessedValue);
      reset();
    }
  };

  const handleSubmitSoloCut = () => {
    if (guessedValue) {
      onSoloCut(guessedValue);
      reset();
    }
  };

  const handleSubmitDoubleDetector = () => {
    if (selectedWire1 && selectedWire2) {
      onDoubleDetector(selectedWire1, selectedWire2);
      reset();
    }
  };

  if (mode === "idle") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Choose Action
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("duo_cut")}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Duo Cut
          </button>
          <button
            onClick={() => setMode("solo_cut")}
            className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            Solo Cut
          </button>
          {!doubleDetectorUsed && (
            <button
              onClick={() => setMode("double_detector")}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
            >
              Double Detector
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {mode === "duo_cut" && "Duo Cut — Pick a wire and guess its value"}
          {mode === "solo_cut" && "Solo Cut — Name a value to cut from your rack"}
          {mode === "double_detector" && "Double Detector — Pick 2 wires to compare"}
        </h3>
        <button
          onClick={reset}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>

      {mode === "duo_cut" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {otherPlayerWires.map((w) => {
              const owner = players.find((p) => p.id === w.playerId);
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedWire1(w.id)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    selectedWire1 === w.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {owner?.name} #{w.rackPosition + 1} ({w.value ?? "?"})
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={guessedValue}
            onChange={(e) => setGuessedValue(e.target.value)}
            placeholder="Guess value (1-6)"
            maxLength={1}
            className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-center dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            onClick={handleSubmitDuoCut}
            disabled={!selectedWire1 || !guessedValue}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Cut Wire
          </button>
        </div>
      )}

      {mode === "solo_cut" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You have {myWires.length} hidden wires on your rack.
          </p>
          <input
            type="text"
            value={guessedValue}
            onChange={(e) => setGuessedValue(e.target.value)}
            placeholder="Value to cut (1-6)"
            maxLength={1}
            className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-center dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            onClick={handleSubmitSoloCut}
            disabled={!guessedValue}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Solo Cut
          </button>
        </div>
      )}

      {mode === "double_detector" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Select 2 of your own wires to check if they share the same value.
          </p>
          <div className="flex flex-wrap gap-2">
            {myWires.map((w) => {
              const isSelected =
                selectedWire1 === w.id || selectedWire2 === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    if (selectedWire1 === w.id) {
                      setSelectedWire1(null);
                    } else if (selectedWire2 === w.id) {
                      setSelectedWire2(null);
                    } else if (!selectedWire1) {
                      setSelectedWire1(w.id);
                    } else if (!selectedWire2) {
                      setSelectedWire2(w.id);
                    }
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isSelected
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  Wire #{w.rackPosition + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleSubmitDoubleDetector}
            disabled={!selectedWire1 || !selectedWire2}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Check Wires
          </button>
        </div>
      )}
    </div>
  );
}
