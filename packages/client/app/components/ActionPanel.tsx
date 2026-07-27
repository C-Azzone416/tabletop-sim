"use client";

import { useState } from "react";
import type { Wire, Player } from "@tabletop/shared";

export type ActionMode = "idle" | "dual_cut" | "solo_cut" | "double_detector" | "reveal_reds";

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

  // Button variants per DESIGN-APPENDIX.md §7/§16 — primary/secondary/yellow/
  // danger/ghost is the platform's full palette, mapped one-to-one onto this
  // panel's four actions plus Cancel. Buttons are a platform component; a
  // game may not invent its own button colors.
  const primaryBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-2 text-sm font-bold text-accent-ink shadow-print-sm disabled:opacity-50";
  const secondaryBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-surface-raised px-4 py-2 text-sm font-bold text-ink shadow-print-sm disabled:opacity-50";
  const yellowBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-warning px-4 py-2 text-sm font-bold text-warning-ink shadow-print-sm disabled:opacity-50";
  const dangerBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-danger px-4 py-2 text-sm font-bold text-accent-ink shadow-print-sm disabled:opacity-50";
  const ghostBtn = "text-sm text-ink-muted hover:text-ink";

  if (mode === "idle") {
    return (
      <div className="flex flex-col gap-3 rounded-cab border-2 border-outline bg-surface-raised p-4">
        <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Choose Action
        </h3>
        <div className="flex gap-2">
          <button onClick={() => onSetMode("dual_cut")} className={`flex-1 ${primaryBtn}`}>
            Dual Cut
          </button>
          <button onClick={() => onSetMode("solo_cut")} className={`flex-1 ${secondaryBtn}`}>
            Solo Cut
          </button>
          {!doubleDetectorUsed && (
            <button onClick={() => onSetMode("double_detector")} className={`flex-1 ${yellowBtn}`}>
              Double Detector
            </button>
          )}
          {hasRedWires && (
            <button onClick={onRevealReds} className={`flex-1 ${dangerBtn}`}>
              Reveal Reds
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-cab border-2 border-outline bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          {mode === "dual_cut" && "Dual Cut — Click an opponent's wire to guess its value"}
          {mode === "solo_cut" && "Solo Cut — Select 2 matching wires on your rack"}
          {mode === "double_detector" && "Double Detector — Pick 2 wires to compare"}
          {mode === "reveal_reds" && "Reveal Reds"}
        </h3>
        <button onClick={handleCancelAll} className={ghostBtn}>
          Cancel
        </button>
      </div>

      {mode === "dual_cut" && (
        <p className="text-sm text-ink-muted">
          Click any opponent wire tile on the board above to open the guess popup.
        </p>
      )}

      {mode === "solo_cut" && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            {soloCutSelectedCount === 0 && "Select a revealed wire from your rack."}
            {soloCutSelectedCount === 1 && "Select one more matching wire."}
            {soloCutSelectedCount >= 2 && soloCutMatchStatus === "valid" && "Wires match — ready to cut!"}
            {soloCutSelectedCount >= 2 && soloCutMatchStatus === "mismatch" && (
              <span className="text-danger">Selected wires don&apos;t match.</span>
            )}
          </p>
          <button
            onClick={onSoloCutConfirm}
            disabled={soloCutMatchStatus !== "valid"}
            className={secondaryBtn}
          >
            Confirm Solo Cut
          </button>
        </div>
      )}

      {mode === "double_detector" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
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
                  className={`rounded-cab border-2 px-3 py-2 text-sm ${
                    isSelected
                      ? "border-warning bg-warning/20"
                      : "border-outline/40"
                  }`}
                >
                  Wire #{w.rackPosition}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleSubmitDoubleDetector}
            disabled={!ddWire1 || !ddWire2}
            className={yellowBtn}
          >
            Check Wires
          </button>
        </div>
      )}
    </div>
  );
}
