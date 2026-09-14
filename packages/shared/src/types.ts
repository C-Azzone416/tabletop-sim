// Game state types

import type { GameId } from './game-registry';
import type { FlipTableView } from './flip-view';

export type GameStatus = 'waiting' | 'setup' | 'active' | 'won' | 'lost';
export type WireColor = 'blue' | 'yellow' | 'red';
export type WireStatus = 'hidden' | 'cut' | 'revealed';
export type ActionType = 'dual_cut' | 'solo_cut' | 'double_detector' | 'reveal_reds';
export type TurnResult = 'success' | 'fail' | 'explosion';

export interface Game {
  id: string;
  gameType: GameId;
  mission: number;
  status: GameStatus;
  /**
   * #437 — the host's chosen room capacity, not the game's registry
   * ceiling. Persisted at create_game so join_game (and the lobby's
   * "n/<count>" display) can enforce/show what the host actually asked for
   * rather than the game's maximum, which may be higher.
   */
  maxPlayers: number;
  captainId: string | null;
  currentTurnPlayerId: string | null;
  joinCode: string;
  detonatorPosition: number;
  detonatorMax: number;
  pendingInterrogationAskerId: string | null;
  pendingInterrogationAnswererId: string | null;
  pendingInterrogationWireId: string | null;
  pendingDualCutWireId: string | null;
  pendingDualCutProposerId: string | null;
  pendingDualCutGuessedValue: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  gameId: string;
  name: string;
  seatOrder: number;
  doubleDetectorUsed: boolean;
  ready: boolean;
  setupDone: boolean;
  joinedAt: string;
}

export interface Wire {
  id: string;
  gameId: string;
  playerId: string;
  value: string | null;
  /**
   * Null in client-bound views of OTHER players' hidden wires (#187):
   * color is mission-deciding information on red-wire missions, so it is
   * redacted exactly like value. Always present on server-side DB rows.
   */
  color: WireColor | null;
  /**
   * 1-based position in the player's rack (wire-dealer.ts assigns
   * index + 1, never 0). This is already the player-facing "Wire #N"
   * number — display it as-is, do not add 1 again (#147).
   */
  rackPosition: number;
  status: WireStatus;
}

export interface InfoToken {
  id: string;
  gameId: string;
  wireId: string;
  value: string;
  placedAt: string;
  /**
   * True for tokens created by dev tooling (/dev/reveal-all-tokens, the
   * seed-near-win backfill) rather than real gameplay. Only these are
   * removed by POST /dev/hide-dev-tokens (#172).
   */
  devCreated: boolean;
}

export type MissionOutcomeResult = 'won' | 'lost';

/**
 * Per-profile best outcome for a mission (#170): 'won' once beaten (never
 * downgraded by a later loss), 'lost' if only tried and failed, no row at
 * all if never played. Feeds the home-screen indicators and #179's unlocks.
 */
export interface MissionOutcome {
  profileId: string;
  mission: number;
  outcome: MissionOutcomeResult;
  updatedAt: string;
}

/**
 * #215/#190 — a value revealed as "possible" at setup under a mission's
 * partial-knowledge "N out of M" draw (WireGroup.candidatePoolSize > count).
 * Not a Wire: some candidates never become a real dealt tile (set aside
 * unseen), so this has no owner/rack position. Deliberately has NO
 * dealt/confirmed flag — sending one would leak which candidates are
 * actually in play, killing the deduction mechanic. Broadcast identically
 * to every player (no per-player redaction, unlike Wire); the client
 * derives "confirmed in play" itself by cross-referencing a candidate's
 * (color, value) against wires that become visible through normal play.
 */
export interface WireCandidate {
  gameId: string;
  color: WireColor;
  value: string;
}

export interface ValidationToken {
  id: string;
  gameId: string;
  wireValue: string;
  wireColor: WireColor;
  validatedAt: string;
}

export interface Turn {
  id: string;
  gameId: string;
  playerId: string;
  actionType: ActionType;
  targetWireId: string | null;
  targetWireId2: string | null;
  guessedValue: string | null;
  result: TurnResult | null;
  createdAt: string;
}

// WebSocket message types

/**
 * #462 — the WS close code the client's DevPanel seat switcher uses when it
 * intentionally closes a seat's socket to open a different one, as opposed
 * to a genuine disconnect (tab close, reload, network drop, crash), which
 * always closes with no code or a browser-default one.
 *
 * The server-side #446 disconnect-grace-window logic recognizes this
 * specific code as "parked, not leaving" and skips arming the timer for it
 * — gated on ENABLE_DEV_SEED so the exemption can only ever be produced by
 * dev tooling, never by a real player's browser (which has no reason to
 * ever send this code). A real disconnect while using DevPanel still uses
 * no code / a default one and gets the exact same grace window as any other
 * player — this constant changes nothing about production behavior.
 *
 * Chosen from the 3000-4999 application-defined range (RFC 6455 §7.4.2),
 * clear of both the reserved 1000-1015 range and the server's own existing
 * 4001 (auth failure) and 1000 ("superseded by a newer connection") uses.
 */
export const DEV_SEAT_SWITCH_CLOSE_CODE = 4700;

/**
 * #329 — the lobby's in-progress per-game config value, replicated so every
 * player (not just the captain) can see the current pick live. Opaque to
 * the platform on purpose: this is the slot's own INTERNAL config shape —
 * exactly what `createDefaultConfig`/a panel's `onChange` produces
 * client-side (`packages/client/app/components/lobbyConfig/types.ts`),
 * Wire Game's `{ mission: number }` today. Deliberately NOT the
 * `toStartArg`-mapped wire shape `start_game` uses to commit a game —
 * that mapping only needs to exist once, at commit time; broadcasting the
 * raw internal shape lets a non-captain's client feed a received value
 * straight back into the same panel component with no second mapping
 * function required. The platform stores and forwards it without
 * interpreting it; only the slot that owns a given game's config shape
 * ever reads inside it.
 */
export type LobbyConfigValue = number | Record<string, unknown>;

export type ClientMessage =
  // #437 — maxPlayers is the host's chosen room capacity, required of the
  // caller for the same reason gameType is (#313): no client-side default,
  // so a missing/invalid value is a rejectable error server-side rather than
  // a silently-assumed one.
  | { type: 'create_game'; playerName: string; gameType: GameId; maxPlayers: number }
  | { type: 'join_game'; joinCode: string; playerName: string }
  | { type: 'start_game'; mission?: number }
  | { type: 'place_info_token'; wireId: string }
  | { type: 'propose_dual_cut'; targetWireId: string; guessedValue: string }
  | { type: 'respond_dual_cut'; accepted: boolean }
  | { type: 'complete_dual_cut'; ownWireId: string }
  | { type: 'solo_cut'; wireValue: string }
  | { type: 'double_detector'; targetWireId: string; targetWireId2: string }
  | { type: 'reveal_reds' }
  | { type: 'player_ready' }
  | { type: 'next_mission'; mission: number }
  // #387 — Flip actions. Note what these deliberately do NOT carry: an
  // acting-player id. The server takes the actor from the socket's
  // authenticated binding, so there is no field in which a client could claim
  // to be another seat.
  //
  // `targetPlayerId` is the game-scoped player id, matching what the client
  // already holds: FlipTableView speaks player ids throughout, and the target
  // picker renders straight off `pendingAction.eligibleTargetIds`.
  // #358 — the dealer triggers each round explicitly, including the first;
  // without this there is no way to start play after a seed, or the next
  // round after one ends.
  | { type: 'flip_start_round' }
  | { type: 'flip_hit' }
  | { type: 'flip_freeze' }
  | { type: 'flip_choose_freeze_target'; targetPlayerId: string }
  | { type: 'flip_choose_flip3_target'; targetPlayerId: string }
  // #431 — no payload: the actor comes from the socket's authenticated
  // binding, same reasoning as the Flip actions above.
  | { type: 'leave_game' }
  // #438 — host-only, lobby-only room resize. No acting-player field, same
  // reasoning as leave_game: the host is derived server-side from
  // game.captainId against the socket's bound player id, never claimed by
  // the client. maxPlayers is the requested new value, validated against
  // the game's registry bounds and current occupancy in engine.updatePlayerCount.
  | { type: 'update_player_count'; maxPlayers: number }
  // #329 — captain-only, lobby-only: replicates the in-progress config value
  // into room state so every player sees the live pick, not just the
  // captain. Broadcast on every committed change (see `lobby_config_updated`
  // below for why "committed" is the right granularity), not persisted —
  // `start_game`'s own `mission` field remains the sole authoritative value;
  // this is a live preview of what the captain currently has selected, nothing
  // more.
  | { type: 'update_lobby_config'; config: LobbyConfigValue };

export type ServerMessage =
  // #329 — `lobbyConfig` is null at creation (the captain has not sent a
  // value yet — create_game carries no config) and on a late join before
  // the captain's own mount-effect has had a round trip to reach the
  // server. Null is unambiguous: a real value is always a number or a
  // non-null object, per LobbyConfigValue.
  | { type: 'game_created'; game: Game; player: Player; lobbyConfig: LobbyConfigValue | null }
  | { type: 'joined_game'; game: Game; player: Player; players: Player[]; lobbyConfig: LobbyConfigValue | null }
  | { type: 'game_started'; game: Game; players: Player[]; wires: Wire[]; candidates: WireCandidate[] }
  | { type: 'setup_complete'; game: Game }
  // #382 — the wire game's shape, unchanged. `flip` is absent on this path.
  //
  // #329 QA finding (#505) — `lobbyConfig` belongs on `game_state`, not
  // just `game_created`/`joined_game`. A browser client's #454 architecture
  // opens a SECOND WebSocket connection for the page that actually renders
  // (the first, whose `joined_game` correctly carried this, is deliberately
  // disconnected before navigating); the server treats that second
  // connection as a RECONNECT and sends `game_state`, never `joined_game`.
  // Omitting it here meant a non-captain's real rendered client never
  // received the captain's already-live pick at all — verified missing via
  // raw WS frame inspection, not assumed. Null once the game leaves the
  // lobby (connection-manager's lobbyConfigs entry is cleared on start),
  // which is correct — nothing reads it once `Lobby.tsx` is no longer
  // mounted.
  | { type: 'game_state'; game: Game; players: Player[]; wires: Wire[]; infoTokens: InfoToken[]; validationTokens: ValidationToken[]; localPlayerId: string; candidates: WireCandidate[]; lobbyConfig: LobbyConfigValue | null; flip?: undefined }
  // #382 — Flip carries no wires/tokens/candidates at all, and no wiresDb call
  // is made to produce it. Identical for every player: `localPlayerId` says
  // which seat is yours, never what you may see (#358 — no hidden state).
  //
  // #406 — `flip` is NULL in the lobby, before the dealer starts the first
  // round. That is a normal state, not an error: under the ruled
  // awaiting-round-start flow a Flip room legitimately has no table until the
  // round begins, and the client still needs `game` and `players` to render
  // the lobby at all. The KEY is always present on this variant, so narrow on
  // its presence (`'flip' in msg`) rather than its truthiness — a null would
  // otherwise fall through to the wire-game branch and read `wires`.
  //
  // #329 (#505) — same `lobbyConfig` fix as the wire-game variant above,
  // same reason.
  | { type: 'game_state'; game: Game; players: Player[]; localPlayerId: string; flip: FlipTableView | null; lobbyConfig: LobbyConfigValue | null }
  | { type: 'player_joined'; player: Player }
  | { type: 'dual_cut_proposed'; proposingPlayerId: string; targetPlayerId: string; targetWireId: string; targetWireRackPosition: number; guessedValue: string }
  | { type: 'dual_cut_correct'; targetWireId: string; targetWireRackPosition: number; targetWireColor: WireColor }
  | { type: 'turn_result'; turn: Turn; game: Game; updatedWires: Wire[] }
  | { type: 'validation_complete'; wireValue: string; wireColor: WireColor; game: Game }
  | { type: 'wire_updated'; wire: Wire }
  | { type: 'players_updated'; players: Player[] }
  | { type: 'game_over'; result: 'won' | 'lost'; reason: string }
  // #431 — the "someone left" notice channel for a non-host departure
  // (leave or disconnect, lobby or mid-game). Carries enough for a client to
  // say who left; what happens next (stay in the lobby, end the game,
  // continue play) is decided per game type by #432/#433/#434, not here.
  //
  // #432 — `gameEnded` is only ever true for a MID-GAME departure that the
  // per-game dispatch point (game-engine.ts) decided ends the mission (Wire
  // Game today). It is never set for a lobby departure (#454's silent
  // roster-filter case) or for a non-ending mid-game departure (Flip,
  // #434). Optional/omittable rather than a plain boolean so existing
  // lobby-only `player_left` handling (#454) never has to construct it.
  | { type: 'player_left'; playerId: string; playerName: string; gameEnded?: boolean }
  // #431 — the host leaving or disconnecting closes the room in every phase
  // and every game (Caroline's ruling — captaincy does not reassign). Every
  // remaining client routes to /play; the join code no longer resolves.
  | { type: 'room_closed'; reason: string }
  // #448 — a genuine WS disconnect just armed #446's grace-window timer for
  // this player: they have NOT left (that only becomes true if the window
  // elapses, at which point the existing `player_left` fires instead), so
  // this is purely informational — "give them a moment." Never sent for the
  // #462 dev-seat-switch exemption, since that path never arms the timer
  // in the first place. `player_reconnected` fires if they reconnect before
  // the window elapses; `player_left` covers the window actually elapsing
  // for that player — a client clears its own local "reconnecting" flag on
  // whichever of those two arrives, not specifically wait for
  // `player_reconnected`.
  //
  // `room_closed` (the captain's own window elapsing, or any other host
  // departure) is deliberately NOT part of that clearing set — #451
  // established that once a room closes, the client routes away without
  // reconciling any other piece of GameState (players/wires/game are all
  // left stale too, not just this), so there is nothing for a per-player
  // "reconnecting" flag to stay correct for. See useGameState's
  // `reconnectingPlayerIds` doc comment.
  | { type: 'player_reconnecting'; playerId: string }
  | { type: 'player_reconnected'; playerId: string }
  // #329 — broadcast whenever the captain's `update_lobby_config` commits a
  // new value. "Broadcast every commit" rather than debouncing: every
  // config panel's onChange today fires on a discrete, complete selection
  // (Wire's mission buttons — a click IS the whole change, not a keystroke
  // toward one), so there is no partial-input granularity to coalesce.
  // A future free-text/slider panel (#295) would need to revisit this —
  // flagged, not solved speculatively here. Lobby-phase only (game.status
  // === 'waiting', enforced server-side), so this can never interact with
  // Flip's active-play turn-timer re-arm-on-broadcast behaviour (#502) —
  // the two are mutually exclusive by game phase, checked directly rather
  // than assumed.
  | { type: 'lobby_config_updated'; config: LobbyConfigValue }
  | { type: 'error'; message: string };

/**
 * #448 — how long a client waits after `player_reconnecting` before it
 * actually shows a reconnecting indicator, deliberately separate from
 * #446's DISCONNECT_GRACE_MS (20s, server-side — how long a disconnect is
 * tolerated before being treated as a leave). This one is purely a display
 * threshold: most disconnects this platform itself produces (a reload, a
 * seat switch, a brief network blip) resolve in well under a second, and
 * flashing "Reconnecting…" on every other client for one of those would
 * read as an error where none occurred — worse than showing nothing. Long
 * enough to skip that flash, short enough that a real, longer gap is still
 * visible well before DISCONNECT_GRACE_MS would end it.
 */
export const RECONNECT_INDICATOR_DELAY_MS = 2_000;
