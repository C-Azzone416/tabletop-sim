"use client";

import Link from "next/link";

interface BackAffordanceCommon {
  /** e.g. "← Back" or "← Leave". */
  label: string;
  className?: string;
}

interface BackAffordanceLinkProps extends BackAffordanceCommon {
  /** A real route — renders a real <Link>, so browser back matches. */
  href: string;
  onClick?: never;
  disabled?: never;
}

interface BackAffordanceButtonProps extends BackAffordanceCommon {
  /** No real route to go to — e.g. leaving a lobby has to send leave_game
   * first. Renders a <button> instead of a <Link>. */
  onClick: () => void;
  href?: never;
  disabled?: boolean;
}

type BackAffordanceProps = BackAffordanceLinkProps | BackAffordanceButtonProps;

/**
 * #451 — one back/leave idiom shared by every screen that needs it, not a
 * second one that merely looks the same. Extracted from `PlayScreen`
 * (`app/play/PlayScreen.tsx`, the original "← Back" as a real `<Link>`)
 * once `Lobby` had a real requirement for it: leaving a lobby frees a seat,
 * so it can't be a plain route `<Link>` like `/play/*`'s back affordance —
 * it has to send `leave_game` first, which only a click handler can do.
 * Same visual treatment (`min-h-11`, same colors) either way.
 */
export function BackAffordance(props: BackAffordanceProps) {
  const className = `inline-flex min-h-11 items-center text-body text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`;

  if ("href" in props && props.href !== undefined) {
    return (
      <Link href={props.href} className={className}>
        {props.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`press ${className}`}
    >
      {props.label}
    </button>
  );
}
