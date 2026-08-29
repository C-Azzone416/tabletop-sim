// Matches the server's join-code alphabet (game-engine.ts's generateJoinCode):
// 6 chars from A-Z/2-9 excluding I, O, 0, 1 to avoid visual ambiguity. A code
// that doesn't match this shape can never be real, so #317 catches it
// client-side before a round trip rather than waiting on "Game not found".
const JOIN_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function isValidJoinCodeFormat(code: string): boolean {
  return JOIN_CODE_PATTERN.test(code);
}
