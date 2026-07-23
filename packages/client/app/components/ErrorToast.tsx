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
      className="fixed top-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-red-800 bg-red-600 px-4 py-3 text-white shadow-2xl dark:border-red-500 dark:bg-red-700"
    >
      <span className="mt-0.5 text-lg leading-none">⚠</span>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="-mr-1 -mt-1 rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
