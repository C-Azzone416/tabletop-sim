"use client";

import Link from "next/link";
import { PlayScreen } from "./PlayScreen";
import { usePlaySessionGuard } from "./usePlayAction";

interface PlayOption {
  href: string;
  label: string;
  description: string;
}

/**
 * Deliberately equal weight (#310 ruling): same surface, same border, same
 * shadow, same type. Neither option gets --accent, and no --wire-* token
 * goes anywhere near them — Host and Join are chrome, not wires
 * (DESIGN-APPENDIX §3).
 *
 * Join is first in DOM order, which is also its rendered order in both
 * layouts: most arrivals are joiners holding a code, so it takes the thumb
 * position on mobile, and keeping one order everywhere means the reading
 * order and the focus order never disagree.
 */
const OPTIONS: PlayOption[] = [
  {
    href: "/play/join",
    label: "Join Game",
    description: "Enter the code a friend shared with you.",
  },
  {
    href: "/play/host",
    label: "Host New Game",
    description: "Pick a game and invite people to your room.",
  },
];

export default function PlayChoice() {
  const guard = usePlaySessionGuard();

  if (guard !== "ready") return null;

  return (
    <PlayScreen
      backHref="/"
      title="Play"
      subtitle="Are you hosting a new game, or joining one?"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="press flex min-h-11 flex-col rounded-cab border-2 border-outline bg-surface-raised px-5 py-5 shadow-print-md sm:px-6 sm:py-6"
          >
            <span className="text-heading font-bold tracking-tight text-ink">
              {option.label}
            </span>
            <span className="mt-2 text-small text-ink-muted">{option.description}</span>
          </Link>
        ))}
      </div>
    </PlayScreen>
  );
}
