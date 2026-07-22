"use client";

export interface SeatSwitcherSeat {
  name: string;
  profileId: string;
}

interface SeatSwitcherProps {
  seats: SeatSwitcherSeat[];
  activeProfileId: string;
  onSwitch: (seat: SeatSwitcherSeat) => void;
}

// Dev-only control: reconnects the single open WS session as a different
// seeded player (via the existing /ws reconnect path — see GameClient.tsx),
// so cross-seat flows (dual cut, info tokens, turn handoffs) can be
// exercised solo instead of juggling multiple browser windows.
export function SeatSwitcher({ seats, activeProfileId, onSwitch }: SeatSwitcherProps) {
  return (
    <div className="fixed bottom-4 left-4 flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 font-mono text-xs opacity-70 hover:opacity-100 dark:border-amber-600 dark:bg-amber-950/40">
      <span className="text-amber-700 dark:text-amber-400">[DEV] Seat:</span>
      {seats.map((seat) => (
        <button
          key={seat.profileId}
          onClick={() => onSwitch(seat)}
          disabled={seat.profileId === activeProfileId}
          className={`rounded px-2 py-1 ${
            seat.profileId === activeProfileId
              ? "bg-amber-600 text-white"
              : "text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
          }`}
        >
          {seat.name}
        </button>
      ))}
    </div>
  );
}
