"use client";

interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-cab border-2 border-outline bg-danger px-4 py-3 text-accent-ink shadow-print-md"
    >
      <span className="mt-0.5 text-lg leading-none">⚠</span>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="-mr-1 -mt-1 rounded-cab p-1 text-accent-ink/80 hover:bg-accent-ink/10 hover:text-accent-ink"
      >
        ×
      </button>
    </div>
  );
}
