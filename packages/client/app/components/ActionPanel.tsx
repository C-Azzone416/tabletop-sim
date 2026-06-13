"use client";

import { useState } from "react";
import type { Wire, Player } from "@tabletop/shared";

export type ActionMode = "idle" | "duo_cut" | "solo_cut" | "double_detector" | "reveal_reds";

interface ActionPanelProps {
  isMyTurn: boolean;
  players: Player[];
  wires: Wire[];
  localPlayerId: string;
  doubleDetectorUsed: boolean;
  hasRedWires: boolean;
  mode: ActionMode;
  onSetMode: (mode: ActionMode) => void;
  onCancel: () => void;
  // Solo cut — wire selection happens on board tiles
  soloCutSelectedCount: number;
  soloCutMatchStatus: "idle" | "valid" | "mismatch";
  onSoloCutConfirm: () => void;
  // Double detector — wire selection stays in this panel
  onDoubleDetector: (targetWireId: string, targetWireId2: string) => void;
  // Reveal reds — one-click action
  onRevealReds: () => void;
}

export function ActionPanel({
  isMyTurn,
  wires,
  localPlayerId,
  doubleDetectorUsed,
  hasRedWires,
  mode,
  onSetMode,
  onCancel,
  soloCutSelectedCount,
  soloCutMatchStatus,
  onSoloCutConfirm,
  onDoubleDetector,
  onRevealReds,
}: ActionPanelProps) {
  const [ddWire1, setDdWire1] = useState<string | null>(null);
  const [ddWire2, setDdWire2] = useState<string | null>(null);

  if (!isMyTurn) return null;

  const myHiddenWires = wires.filter(
    (w) => w.playerId === localPlayerId && w.status === "hidden"
  );

  const handleCancelAll = () => {
    setDdWire1(null);
    setDdWire2(null);
    onCancel();
  };

  const handleSubmitDoubleDetector = () => {
    if (ddWire1 && ddWire2) {
      onDoubleDetector(ddWire1, ddWire2);
      setDdWire1(null);
      setDdWire2(null);
      onCancel();
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
            onClick={() => onSetMode("duo_cut")}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Duo Cut
          </button>
          <button
            onClick={() => onSetMode("solo_cut")}
            className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            Solo Cut
          </button>
          {!doubleDetectorUsed && (
            <button
              onClick={() => onSetMode("double_detector")}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
            >
              Double Detector
            </button>
          )}
          {hasRedWires && (
            <button
              onClick={onRevealReds}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Reveal Reds
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
          {mode === "duo_cut" && "Duo Cut — Click an opponent's wire on the board"}
          {mode === "solo_cut" && "Solo Cut — Select 2 matching wires on your rack"}
          {mode === "double_detector" && "Double Detector — Pick 2 wires to compare"}
          {mode === "reveal_reds" && "Reveal Reds"}
        </h3>
        <button
          onClick={handleCancelAll}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>

      {mode === "duo_cut" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Click any opponent wire tile on the board above to select it.
        </p>
      )}

      {mode === "solo_cut" && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {soloCutSelectedCount === 0 && "Select a revealed wire from your rack."}
            {soloCutSelectedCount === 1 && "Select one more matching wire."}
            {soloCutSelectedCount >= 2 && soloCutMatchStatus === "valid" && "Wires match — ready to cut!"}
            {soloCutSelectedCount >= 2 && soloCutMatchStatus === "mismatch" && (
              <span className="text-red-500 dark:text-red-400">Selected wires don&apos;t match.</span>
            )}
          </p>
          <button
            onClick={onSoloCutConfirm}
            disabled={soloCutMatchStatus !== "valid"}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirm Solo Cut
          </button>
        </div>
      )}

      {mode === "double_detector" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Select 2 of your own wires to check if they share the same value.
          </p>
          <div className="flex flex-wrap gap-2">
            {myHiddenWires.map((w) => {
              const isSelected = ddWire1 === w.id || ddWire2 === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    if (ddWire1 === w.id) {
                      setDdWire1(null);
                    } else if (ddWire2 === w.id) {
                      setDdWire2(null);
                    } else if (!ddWire1) {
                      setDdWire1(w.id);
                    } else if (!ddWire2) {
                      setDdWire2(w.id);
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
            disabled={!ddWire1 || !ddWire2}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Check Wires
          </button>
        </div>
      )}
    </div>
  );
}
