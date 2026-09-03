'use client';

import type { GameType } from '@tabletop/shared';

interface GameSelectorProps {
  selected: GameType;
  onSelect: (gameType: GameType) => void;
  disabled?: boolean;
}

const choices: ReadonlyArray<{
  type: GameType;
  title: string;
  description: string;
  accent: string;
  icon: string;
}> = [
  {
    type: 'spades',
    title: 'Spades',
    description: 'Classic partnership trick-taking for one to four people.',
    accent: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    icon: '♠',
  },
  {
    type: 'wire-game',
    title: 'Wire Game',
    description: 'Work together to identify and cut the correct wires.',
    accent: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
    icon: '⚡',
  },
];

export function GameSelector({ selected, onSelect, disabled = false }: GameSelectorProps) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
        Choose a game
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((choice) => {
          const active = selected === choice.type;
          return (
            <button
              key={choice.type}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(choice.type)}
              className={`rounded-xl border-2 p-4 text-left transition ${
                active
                  ? `${choice.accent} ring-2 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-950`
                  : 'border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="text-3xl" aria-hidden="true">{choice.icon}</span>
              <strong className="mt-2 block text-zinc-950 dark:text-white">{choice.title}</strong>
              <span className="mt-1 block text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                {choice.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
