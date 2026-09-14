"use client";

import { useRouter } from "next/navigation";

interface RoomClosedNoticeProps {
  reason: string;
}

/**
 * #451 — the host-departure case: rendered ahead of every other phase
 * branch in GameClient, regardless of game type, whenever `room_closed`
 * arrives. A full-page card rather than a toast, matching GameOverOverlay's
 * existing idiom for "this room is over, here's an explicit way out" —
 * same reasoning: a stray auto-redirect racing a still-loading screen is
 * worse than one clear action the player takes themselves.
 */
export function RoomClosedNotice({ reason }: RoomClosedNoticeProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-cab border-2 border-outline bg-surface-raised p-8 text-center shadow-print-md">
        <h2 className="text-2xl font-bold text-ink">Room Closed</h2>
        <p className="mt-2 text-ink-muted">{reason}</p>
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="press mt-6 w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-6 py-3 font-bold text-accent-ink shadow-print-sm"
        >
          Back to Play
        </button>
      </div>
    </div>
  );
}
