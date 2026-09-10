/**
 * The C4 announcement (#366 acceptance: "names what happened, in platform
 * voice"). Pure display — turnTimeout.ts owns the wording.
 */
export interface TimeoutAnnouncementProps {
  message: string | null;
}

export function TimeoutAnnouncement({ message }: TimeoutAnnouncementProps) {
  if (!message) return null;

  return (
    <p
      role="status"
      data-testid="timeout-announcement"
      className="rounded-cab bg-info/10 px-4 py-2 text-center text-sm text-info"
    >
      {message}
    </p>
  );
}
