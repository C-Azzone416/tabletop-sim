"use client";

interface MissionEndedNoticeProps {
  reason: string;
  onDismiss: () => void;
}

/**
 * #432 — the non-host mid-game leave case for Wire Game: the mission ends
 * but the ROOM SURVIVES (contrast with RoomClosedNotice's host-departure
 * case, where it doesn't). Same "full-page card, explicit button, no
 * auto-navigate" idiom RoomClosedNotice established — a stray auto-dismiss
 * racing a still-loading screen is worse than one clear action the player
 * takes themselves — but dismissing here reveals the Lobby underneath
 * rather than routing anywhere: the room is still there to restart from
 * (#438's resize-and-restart), which is the whole point of #432's ruling
 * ("this will help games restart faster ... instead of having to create a
 * new lobby").
 */
export function MissionEndedNotice({ reason, onDismiss }: MissionEndedNoticeProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-cab border-2 border-outline bg-surface-raised p-8 text-center shadow-print-md">
        <h2 className="text-2xl font-bold text-ink">Mission Ended</h2>
        <p className="mt-2 text-ink-muted">{reason}</p>
        <p className="mt-1 text-ink-muted">Everyone&apos;s back in the lobby — restart when ready.</p>
        <button
          type="button"
          onClick={onDismiss}
          className="press mt-6 w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-6 py-3 font-bold text-accent-ink shadow-print-sm"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
