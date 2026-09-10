import { FLIP_MODIFIER_VALUES, type FlipCardDefinition, type FlipCardInstance, type FlipModifierValue, type FlipNumberValue } from './types';

function parseFlipCardSpec(spec: string): FlipCardDefinition {
  if (spec === 'freeze' || spec === 'flip3' || spec === 'second-chance') {
    return { kind: 'action', action: spec };
  }
  if (spec === 'x2' || /^\+\d+$/.test(spec)) {
    if (!(FLIP_MODIFIER_VALUES as readonly string[]).includes(spec)) {
      throw new Error(`unknown Flip modifier: ${spec}`);
    }
    return { kind: 'modifier', modifier: spec as FlipModifierValue };
  }
  if (/^\d+$/.test(spec)) {
    const value = Number(spec);
    if (value < 0 || value > 12) throw new Error(`Flip number cards run 0-12, got: ${spec}`);
    return { kind: 'number', value: value as FlipNumberValue };
  }
  throw new Error(`unrecognized Flip card spec: "${spec}"`);
}

let counter = 0;

/**
 * Builds concrete FlipCardInstances from short specs, for assembling test
 * and dev-seed hands/discard/shoe without hand-writing object literals —
 * e.g. `flipCards(['7', '0', '+4', 'x2', 'freeze', 'flip3', 'second-chance'])`.
 * Every call mints fresh, globally-unique ids; it does not draw from — or
 * need to match ids with — a particular buildFlipDeck() shoe. The default
 * prefix deliberately differs from buildFlipDeck()'s ("flip") so hand-built
 * specs never collide with an auto-filled shoe built from the real deck.
 */
export function flipCards(specs: readonly string[], idPrefix = 'spec'): FlipCardInstance[] {
  return specs.map((spec) => {
    counter += 1;
    return { ...parseFlipCardSpec(spec), id: `${idPrefix}:${counter}` };
  });
}
