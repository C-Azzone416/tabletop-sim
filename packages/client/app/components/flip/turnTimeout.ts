/**
 * Flip's C4 defaults (#358, ruled): the platform's countdown fires, and this
 * is what the game says happened. Every prompt this game can show has an
 * entry here — the #366 acceptance criterion "no prompt can expire without
 * an action" is the reason this is an exhaustive switch, not an if/else
 * chain that could silently fall through on a fourth prompt nobody added.
 */

export type TimeoutPromptKind = "hit-freeze" | "freeze-target" | "flip3-target";

export function timeoutPromptKind(
  pendingAction: { kind: "freeze" } | { kind: "flip3" } | null,
): TimeoutPromptKind {
  switch (pendingAction?.kind) {
    case "freeze":
      return "freeze-target";
    case "flip3":
      return "flip3-target";
    case undefined:
      return "hit-freeze";
  }
}

/**
 * DESIGN-APPENDIX §10 voice: second person for the affected player's own
 * client, name-not-role for everyone else watching the same event (Flip has
 * no hidden state, so every seat sees it), present tense, never blames the
 * player — the timer ran out, not "you failed to act."
 */
export function describeTimeout(kind: TimeoutPromptKind, playerName: string, isLocal: boolean): string {
  if (isLocal) {
    switch (kind) {
      case "hit-freeze":
        return "You went quiet — froze for the round.";
      case "freeze-target":
        return "You didn't choose — froze yourself.";
      case "flip3-target":
        return "You didn't choose — flipped 3 on yourself.";
    }
  }
  switch (kind) {
    case "hit-freeze":
      return `${playerName}'s gone quiet — froze for the round.`;
    case "freeze-target":
      return `${playerName} didn't choose — froze themself.`;
    case "flip3-target":
      return `${playerName} didn't choose — flipped 3 on themself.`;
  }
}
