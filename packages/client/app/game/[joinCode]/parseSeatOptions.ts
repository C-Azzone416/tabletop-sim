import type { DevSeatOption } from "./GameClient";

// Best-effort parse of the dev-only seatOptions query param — a
// client-controllable string, so malformed/hand-edited input must never
// throw. Only ever called from inside the isDev gate in page.tsx (never
// reachable in production).
export function parseSeatOptions(raw: string | undefined): DevSeatOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is DevSeatOption =>
        typeof p === "object" && p !== null &&
        typeof p.name === "string" && typeof p.profileId === "string"
    );
  } catch {
    return [];
  }
}
