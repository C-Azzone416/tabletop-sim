import { BackAffordance } from "../components/BackAffordance";

interface PlayScreenProps {
  /** Where "← Back" goes. /play -> "/", /play/* -> "/play" (#310 ruling). */
  backHref: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for every screen under /play: the top-left "← Back"
 * affordance, the page heading, and the centred column. /play/host (#316)
 * and /play/join (#317) render inside this so the three screens cannot
 * drift apart.
 *
 * Back is a real <Link> to a real route, so browser back behaves the same
 * as the affordance — these screens are not modal state. The affordance
 * itself lives in BackAffordance (#451) — Lobby's leave control is the
 * same component, rendered as a button instead of a Link since it has to
 * send leave_game before it navigates anywhere.
 */
export function PlayScreen({ backHref, title, subtitle, children }: PlayScreenProps) {
  return (
    <div className="min-h-screen bg-surface px-4 py-6 font-sans sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <BackAffordance href={backHref} label="← Back" />

        <header className="mt-4 sm:mt-6">
          <h1 className="text-display-l-sm font-display tracking-tight text-ink sm:text-display-l">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-body text-ink-muted">{subtitle}</p> : null}
        </header>

        <main className="mt-8">{children}</main>
      </div>
    </div>
  );
}
