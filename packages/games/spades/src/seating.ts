import { shuffleCards } from '@tabletop/cards';
import { generateThemedNames } from './names';
import { SPADES_SEATS, type BotDifficulty, type HumanLobbyPlayer, type SeatedSpadesPlayer } from './types';
import { teamForSeat } from './rules';

export interface AssignSeatsOptions {
  readonly humans: readonly HumanLobbyPlayer[];
  readonly botDifficulties?: readonly BotDifficulty[];
  readonly random?: () => number;
}

export function assignSpadesSeats(options: AssignSeatsOptions): SeatedSpadesPlayer[] {
  if (options.humans.length < 1 || options.humans.length > 4) {
    throw new RangeError('Spades requires between one and four human players');
  }

  const random = options.random ?? Math.random;
  const botCount = 4 - options.humans.length;
  const botNames = generateThemedNames(botCount, options.humans.map((human) => human.name), random);
  const players = [
    ...options.humans.map((human) => ({ ...human, isBot: false as const })),
    ...botNames.map((name, index) => ({
      id: `bot:${index}:${name.toLocaleLowerCase()}`,
      name,
      isBot: true as const,
      difficulty: options.botDifficulties?.[index] ?? 'normal' as BotDifficulty,
    })),
  ];

  return shuffleCards(players, random).map((player, index) => {
    const seat = SPADES_SEATS[index]!;
    return { ...player, seat, team: teamForSeat(seat) };
  });
}
