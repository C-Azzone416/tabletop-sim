export const THEMED_FIRST_NAMES = [
  'Ari', 'Brielle', 'Jessa', 'Elsie', 'Tia', 'Mona', 'Rayna', 'Auria',
  'Cinda', 'Wren', 'Petra', 'Robyn', 'Artie', 'Finn', 'Erik', 'Hugo',
  'Kristy', 'Louis', 'Kip', 'Dalen', 'Miles', 'Kody', 'Navin', 'Bruna',
  'Lucan', 'Miko', 'Anya', 'Elin', 'Maren', 'Kai', 'Niko', 'Flora',
] as const;

export function generateThemedNames(
  count: number,
  existingNames: readonly string[] = [],
  random: () => number = Math.random,
): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative integer');
  }

  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
  const available = THEMED_FIRST_NAMES.filter((name) => !used.has(name.toLocaleLowerCase()));
  if (count > available.length) {
    throw new RangeError('not enough unique themed names are available');
  }

  const chosen: string[] = [];
  while (chosen.length < count) {
    const index = Math.floor(random() * available.length);
    chosen.push(available.splice(Math.min(index, available.length - 1), 1)[0]!);
  }
  return chosen;
}
