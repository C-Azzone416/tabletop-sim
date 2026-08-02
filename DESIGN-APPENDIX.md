# Cabinet — Design System Appendix

> The short version is `DESIGN.md`. This file holds the reasoning, the code samples, the marketing response, and the detail an agent only needs occasionally. Nothing here contradicts the short version; if it appears to, the short version wins.

---

# Original full spec

**v1.3** — the platform/game split now applies to rules as well as tokens and components. Game-conditional rules are stated as contracts, not universals. See §2b and §17.13.

Authoritative design spec for the board game platform UI. Written to be read by a coding agent working in this repo.

> **"Cabinet" is an internal codename, not a product name.** It must never appear in the interface, in a URL, in a page title, in an OG tag, or in user-visible copy. It is fine in file names, CSS comments, class prefixes, and this document. Until a product name exists, use the literal placeholder `PRODUCT_NAME` in any user-facing string so a grep finds every instance. Recommend a CI check: fail the build on a case-insensitive match for `cabinet` under `packages/client/**` excluding `styles/`.

**Companion file**

- `packages/client/styles/theme.css` — every color, size, radius, and duration, as Tailwind 4 CSS-first config. The source of truth for values.

If this file and `theme.css` ever disagree, the CSS wins for values and this file wins for rules. There is no `tailwind.config.js` and no JSON token file; Tailwind 4 configures from CSS, and a second copy of the values would only drift.

Stack this was written against: Next.js 16.2 App Router, React 19.2, Tailwind 4 via PostCSS, Vitest + Testing Library + jsdom, Playwright for E2E. See §16.

---

## 0. Rules for the agent

1. **Never hardcode a color, radius, spacing value, or duration in a component.** Reference a semantic token from `theme.css`.
2. **Never reference a `--cab-*` raw brand token outside `theme.css`.** Components use the generated utilities only — `bg-surface`, `text-ink`, `border-outline`, `shadow-print-md`, `bg-p3`.
3. **Never use a Tailwind arbitrary value for a design decision** — no `bg-[#E43126]`, no `text-[17px]`, no `shadow-[4px_4px_0]`. If a token is missing, add it to `theme.css` with both light and dark values and append a line to §14 Open questions.
4. **Every component must work in both schemes without knowing which is active.** Test by toggling `.dark` on the root element. If a component needs a mode check in JS, the token set is wrong — fix the tokens.
5. **`export const viewport = { colorScheme: "light dark" }` is required in the root layout.** Without it, mobile browsers force-darken the app themselves and destroy the player colors. This is not optional and it is not cosmetic.
6. **Do not add a third font, a gradient, a blurred shadow, or a border radius above 6px** (except `--r-pill` on counts). These are identity violations, not preferences.
7. **Never ship the codename** (see the note at the top) and never introduce the source game's name, artwork, or rulebook wording. This product is a digital adaptation of a published board game: mechanics are not protected, but names, art, and written text are. All naming, iconography, and rules text in this product must be original. If you need to describe a rule, write it fresh — do not paraphrase the rulebook closely.
8. Ask before deviating. This spec is opinionated on purpose; the tradeoffs behind each rule are documented where they're non-obvious.

---

## 1. Product context

Turn-based multiplayer board games in the browser. Beta launch is **one game, 2–5 players**.

The view is **first person from a seat**: opponents sit along the far edge, the board sits in the middle tilted slightly away, and the player's own hand or tray sits pinned to the bottom of the screen where only they can see it.

The design target is the moment somebody pastes a link into a group chat and four people have to be playing a minute later. When a decision is close, choose the option a first-time player understands faster.

---

## 2. Identity in one paragraph

Cabinet takes its language from the printed game box, not the board inside it: mid-century box lithography, screen-printed posters, risograph, scoreboard enamel. Flat spot colors, heavy navy outlines on everything interactive, hard offset shadows with no blur, halftone dots where a printer would have used them.

**Three words:** Loud. Welcoming. Quick.

| Do | Don't |
|---|---|
| Flat spot color, 2–3 colors per screen | Gradients, blurred shadows, glassmorphism |
| Outlines on everything touchable | Bubble letters, mascots, cartoon styling |
| One dominant action per screen | Skeuomorphism — nothing pretends to be wood or felt |
| Print technique as reference | Period-specific clip art or nostalgia pastiche |

---

## 2b. Three layers, one split

The platform/game split applies to **tokens, components, and rules**. v1.2 applied it to the first two and left the rules stated as universals, several of which silently assumed this game's mechanics.

| Layer | Platform owns | Game owns |
|---|---|---|
| **Tokens** (§3) | Frame: surface, ink, outline, shadow, accent | Interior: table, rack, pieces, seat colors |
| **Components** (§7) | Buttons, seat chips, toasts, modals, lobby, chat, invite | Board, pieces, hand, campaign, anything config-driven |
| **Rules** (this section) | Invariants — true of every game we will ever host | Conditional contracts — apply *if* the game has the mechanic |

### How rules are written from here

- **Invariant rules are stated flatly.** "Focus is a 3px outline." "One primary button per screen." "Chrome stays still." These hold whether the game has cards, dice, a board, or none of them.
- **Game-conditional rules are stated as contracts**, in the form *"If the game has X, then Y."* The platform guarantees the frame and the constraints; the game declares which contracts it triggers.

A rule that names a card, a die, a hand, or a board is almost certainly conditional. **The test: could a hypothetical second game — no hidden hand, no randomizer, no spatial board — violate this rule and still feel like our product?** If yes, it is a contract, not an invariant.

### The conditional contracts

A game spec opens by declaring which of these it triggers (see the capability table in `docs/games/<slug>.md`).

| Contract | Triggered when | The platform requires |
|---|---|---|
| **C1 — Private state** | Any state visible to one player and not the others | It renders only on that player's client; the server never sends contents to anyone else, only a count or nothing. It lives on its own surface, visually distinct from shared state, using `--game-rack*`. That surface is pinned, never scrolls, never collapses, and holds every action available on the player's turn |
| **C2 — Spatial play surface** | The game has a board, map, or grid | 7° tilt with a flatten toggle; tilt eases to 0° on zoom and never animates during a turn; pan and zoom act on the surface only, never on chrome; max width 640 / 600 / 560 / 520px at 2 / 3 / 4 / 5 players |
| **C3 — Randomizer** | Dice, draws, shuffles, any visible random outcome | The result is shown resolving, not spinning: discrete steps, ≤260ms, no 3D. The outcome must be readable as text for screen readers before any animation completes |
| **C4 — Turn default** | Always — every game has turns — but the *action* is game-defined | The platform guarantees a timeout exists, is announced with a visible countdown started ≥10s earlier, and never silently forfeits. **The game must supply the action taken on timeout.** The platform cannot know what "safest legal move" means and must not guess |

If a game triggers none of C1–C3, none of those rules apply to it and nothing in this spec is violated.

---

## 3. Color

Values live in `theme.css`. Rules:

- **`--outline` is the most-used token in the system.** Every interactive surface has one.
- **`--accent` (box red) is a fill color only.** It fails contrast as body text on paper (4.1:1). Use `--ink` for text.
- **`--warning` (sun) always takes `--ink` on top, never white.**
- **Elevation is a printing offset, not a light source.** Every shadow in a screen points down-right at the same distance. Never blur.
- **Dark is a translation, not an inversion.** Two rules exist only in dark, both documented in the token file: `--shadow` goes *darker* than the surface, and internal rules use `--line-soft` rather than full-strength `--outline`.

### Two token layers — platform frame vs game interior

The brand question "one look, or a look per game?" is unresolved (§17.2). The token structure is arranged so that either answer is cheap, and **no code change is needed to keep the option open**:

| Layer | Tokens | Changes per game? |
|---|---|---|
| **Platform frame** — chrome the player learns once | `--surface`, `--surface-raised`, `--ink`, `--ink-muted`, `--outline`, `--line-soft`, `--shadow-ink`, `--accent` | Never |
| **Game interior** — the play surface | `--game-table`, `--game-rack`, `--game-rack-ink`, `--game-rack-border`, `--game-accent`, `--game-accent-ink`, `--game-concealed`, `--game-concealed-ink`, the game's own object colors (see below), and the five seat colors | Possibly |

The game layer defaults to Cabinet's values, so today the product is visually uniform. A second title overrides only the game layer, scoped to `[data-game="<slug>"]` on the table wrapper. If the brand answer turns out to be total uniformity, the layer simply never gets overridden and costs nothing.

**Rule:** buttons, toasts, modals, lobby, and navigation always use platform tokens. Only the board, rack, pieces, and seat colors may use game tokens. A game may not restyle a dialog.

**Game object colors (added 2026-08-02, Caroline's ruling).** A game whose rules are *spoken in colour* — "cut the yellow wire" — owns tokens for those objects: for this game, `--wire-blue`, `--wire-yellow`, `--wire-red`. Earlier revisions declared the game-interior inventory closed to table/rack/accent/seat colors, which forced rule-bearing object colors to borrow seat tokens. That coupling is the defect: `Wire.tsx` mapped a yellow wire to `--p3`, so a wire could not be re-tinted without re-tinting seat 3, and the "yellow means yours" rack collision (#245) could not be resolved without moving both at once.

**Test for whether an object earns its own token:** the rules refer to it by colour, and a player can be *wrong* about it. Wires qualify; a rack tint does not.

**Constraint that survives the split:** object colors must stay distinguishable from the seat palette, from `--game-concealed`, and from each other — colour still may not be the only signal (see *Player seats* below), and the redaction boundary (#187) means the client may not have colour data at all for a concealed piece.

### Player seats

Five colors, `--p1` through `--p5`, each with a matching `--pN-ink` for text on top. Assigned in join order, never reassigned mid-game.

**Color is never the only signal.** Every seat and every piece carries three encodings:

1. the seat color
2. the player's initial
3. a distinct piece silhouette — circle, square, triangle, diamond, hexagon

The board must be readable in greyscale and by a colorblind player. This is a hard requirement, not a nice-to-have.

---

## 4. Typography

Two faces: **Archivo Black** (display, always uppercase) and **Archivo** (everything read). No third family. Numerals stay in-family using tabular figures — a monospace would pull the identity somewhere else.

| Role | Class | Face | Size / line | Tracking | Used for |
|---|---|---|---|---|---|
| Display XL | `.t-display-xl` | Archivo Black caps | 56 / 54 | -3.5% | Landing hero, game over |
| Display L | `.t-display-l` | Archivo Black caps | 40 / 40 | -3% | Lobby title |
| Heading | `.t-heading` | Archivo Black caps | 24 / 26 | -2% | Modal titles |
| Subhead | `.t-subhead` | Archivo 700 | 19 / 26 | -1% | Turn banner, seat names |
| Body L | `.t-body-l` | Archivo 400 | 17 / 26 | 0 | Rules text, onboarding |
| Body | `.t-body` | Archivo 400 | 15 / 23 | 0 | Chat, default UI |
| Small | `.t-small` | Archivo 500 | 13 / 18 | 0 | Seat chips, timestamps |
| Micro | `.t-micro` | Archivo 700 caps | 11 / 14 | +14% | Labels |
| Numeric | `.t-num` | Archivo 600 tabular | inherits | 0 | Scores, counts, clocks |

Rules:

- Sentence case everywhere except Display and Micro, which are caps.
- **Micro is the only tracked style.** Never letterspace lowercase.
- **15px is the floor for prose** — anything a player reads as a sentence, on any device. This is the rule the marketing brief correctly flagged as internally contradictory in v1: Micro is 11px and was being used for player-facing labels.
  - **Micro (11px) is permitted only for non-essential labels** — eyebrows, section headers, timestamps. Any information conveyed *only* in Micro must also be available elsewhere.
  - **Numbers a player acts on never use Micro.** Hand counts, scores, and clocks are 13px minimum (`text-small` + `.tabular`), because a misread count changes a decision.
  - The rack privacy label ("only you see this") is Micro, and is duplicated by the rack's color and border treatment, so the information survives if the label isn't read.
- **Every number a player compares uses `.t-num`.** Non-tabular scores visibly jitter as they update.
- Display type may wrap; it may not shrink below 31px on a phone.
- One Display per screen. If a screen needs two, it's two screens.

---

## 5. Space, shape, elevation

| Scale | Use |
|---|---|
| `--s1` 4px | Icon-to-label, inside chips |
| `--s2` 8px | Between related controls |
| `--s3` 12px | Card interior, gap between cards in hand |
| `--s4` 16px | Default component padding |
| `--s5` 24px | Between component groups |
| `--s6` 32px / `--s7` 48px | Section rhythm inside a screen |
| `--s8` 64px / `--s9` 96px | Marketing pages only |

| Shape | Value |
|---|---|
| Pieces, tiles | `--r-xs` 2px |
| Default (buttons, cards, chips) | `--r-sm` 4px |
| Dice, screen containers | `--r-md` 6px |
| Counts and badges only | `--r-pill` |
| Standard outline | `--line` 2px |
| Table frame, rack, primary CTA, focus ring | `--line-heavy` 3px |
| Elevation | `--shadow-sm` / `--shadow-md` / `--shadow-lg` (3/5/8px offset, zero blur) |

---

## 6. Iconography

24px grid, **2.4px stroke, square caps, square joins, no rounded terminals**. Geometric construction only: circles, squares, straight lines, 45° diagonals. Stroke weight never changes — scale the box, not the weight.

Required set (20): `seat`, `dice`, `hand`, `turn`, `timer`, `chat`, `invite`, `players`, `winner`, `undo`, `pass`, `settings`, `sound`, `spectate`, `shuffle`, `nudge`, `copy`, `confirm`, `close`, `alert`.

- Icons use `stroke: currentColor` and `fill: none`. Never fill an outline icon, never use two colors inside one icon.
- **Icon-only buttons are forbidden for `pass`, `undo`, and `leave`.** Destructive or unfamiliar actions always carry a word.

---

## 7. Components

### Platform or game?

Same split as the tokens in §3, applied to components. **The test: would a player expect this to look and behave identically in every game on the platform?**

- **Yes → platform component.** Lives in this spec. Buttons, seat chips, toasts, modals, lobby, chat, invite. A game may not restyle these.
- **No → game component.** Lives in that game's own spec, uses game-interior tokens, and inherits every rule in this document (type scale, spacing, icon stencil, motion, voice, accessibility) without adding to the platform inventory.

Anything driven by game configuration — `MISSION_CONFIGS`, rule text, board topology, piece counts — is game data and its UI is a game component. This spec does not enumerate it.

Do not create a platform component from a single game's needs. One instance is not a pattern; wait for the second game to show which parts actually generalize.

### Platform components

Build in this order — each tier depends on the one above.

**P0 — table is unplayable without these**

| Component | Required variants and states |
|---|---|
| Button | primary, secondary, yellow, danger, ghost · lg/md/sm · hover, active, focus, disabled, loading |
| Seat chip | active, next, waiting, disconnected, empty, spectator |
| Private surface (C1) | your-turn vs waiting · empty · contents are game-defined |
| Game object (C1/C2) | face-up, face-down, selected, illegal, just-played — a game with no concealed objects needs only the last three |
| Turn banner | your turn, their turn, paused, game over |
| Play surface (C2) | tilted, flat, zoomed |
| Lobby seat slot | empty, filling, ready, host |
| Invite card | in-app, shared link preview (OG image) |

**P1** — toast (info/success/warning/error), modal (confirm, destructive confirm, game over), chat (message, system line, reaction), scoreboard (live, final).

**P2** — empty states (no table, no players, no history).

### Button rules

- Exactly one primary per screen.
- Press state translates the button 3px down-right and shrinks the shadow to 1px — it physically lands.
- Minimum target 44×44 including padding.

### Seat chip rules

- The active seat carries a 3px `--warning` ring. **This is the only place that ring is used in the entire product.**
- Chips sit in **turn order, left to right**, and never reorder mid-game.
- Below 380px the name truncates before the count does. Pawn and count always survive.

### Rack rules — **contract C1, applies only to games with private state**

The rack is this game's implementation of C1. A game with no hidden per-player state has no rack, and none of this applies to it.

- **Yellow means yours.** The private surface is the only one painted `--game-rack`; that is the privacy signal, and it is why the token is game-interior rather than platform frame.
- Never scrolls, never collapses, never hides — a dimmed rack still tells a player what they're holding.
- Holds *every* action available on the player's turn. In this game that is play, draw, pass, undo; the set is game-defined, the placement is not.

---

## 8. The table

**Invariant — true of every game:**

- **Seat rail across the far edge**, ordered by turn. Active seat expands; others collapse to pawn, name, count.
- **No turn action lives in a top bar.** On mobile, actions belong in the bottom third — the thumb zone.
- **Chrome does not move.** Whatever the play area does, the frame stays put.

**Contract C2 — only if the game has a spatial play surface:**

- **Tilt is 7°** by default, 0° with the flatten toggle, and eases to 0° when a tile is zoomed. **Tilt never animates during a turn.**
- **The surface is what moves.** Pan and zoom act on it only.

**Contract C1 — only if the game has private state:**

- **The private surface is pinned to the bottom**, full width, and owns the thumb zone on mobile.

### Z-order

| Layer | Contents |
|---|---|
| 0 | Background field (halftone) |
| 10 | Shared play surface (C2) |
| 20 | Game objects — pieces, tiles, played cards |
| 30 | Seat rail |
| 40 | Private surface (C1) — always above shared state |
| 50 | Toasts, tooltips, chat |
| 60 | Modals, game-over sheet |

### Seat counts

| Players | Far edge | Play area max (C2) | Watch for |
|---|---|---|---|
| 2 | One chip, expanded, centered | 640px | Feels empty — give the opponent presence, not more chrome |
| 3 | Two chips, centered | 600px | — |
| 4 | Three chips | 560px | Names begin truncating on phones |
| 5 | Four chips, compact | 520px | ~80px per chip at 360px wide |

### Private state (security-relevant) — contract C1

- Private state is **rendered only on that player's client**. The server sends other clients a *count* or nothing — never contents. This is a wire-format rule, not a UI rule: a hidden div is not hidden.
- Where private state has a concealed representation (face-down backs, hidden tokens), it uses `--info` and carries no identifying mark.
- In this game, private state is the hand. In another game it might be a private objective, a bid, or nothing at all.
- **Spectators are out of scope for beta** (resolved; v1 of this spec contradicted itself by defining spectator behavior in this section while listing their existence as an open question). The rule stands as the definition for whenever they are built: a spectator sees exactly what an empty seat would see, and the server must never send them hand contents.
- Until spectators exist, "All five seats are taken. Want to watch?" (§10) must not ship. Use "All five seats are taken." with no offer.

---

## 8b. Game components — what the platform owes them

Not an inventory. The platform's obligation is to give game components somewhere to live and a set of rules to inherit.

**The platform provides:**

- The game-interior token layer (§3) — table, rack, pieces, seat colors.
- A full-bleed play region with the z-order in §8, into which a game renders whatever it needs.
- Every cross-cutting rule in this document: type scale, spacing, icon stencil, motion timings, voice, accessibility criteria, both color schemes.

**A game component must not:** restyle a dialog, toast, or button; add a typeface; introduce a color outside the game-interior layer; or override platform spacing.

**One genuinely platform-level question, unresolved.** Progression is currently one game's mechanic, so its UI is that game's business. But if a player has progress in more than one game, the *place they see it* — a home or library surface answering "what have I played, what's next" — is platform, and doesn't exist yet. The game supplies the content; the platform supplies the shelf.

That surface should be designed when a second game with progression exists, not before. Until then, progression UI belongs entirely to the game.

**Recommended structure:** this file is platform-wide. Per-game specs go in `docs/games/<slug>.md` and open by declaring which game-interior tokens they override and nothing else.

---

## 9. Motion

Chrome stays still. Only game objects move, and only to explain something that happened. Nothing loops, floats, or pulses for attention.

| Duration | Use |
|---|---|
| `--t-fast` 120ms | Hover, press, focus — anything the player caused directly |
| `--t-base` 180ms | Object lift, seat state change, toast in |
| `--t-slow` 260ms | Turn handoff, dealing, game-over sheet |

Easing is `--ease` for everything except timers, which are **linear** — a clock that eases is a lie.

**Platform motions — every game has these:**

1. **Turn handoff** — banner slides 12px, the sun ring moves to the next seat, 260ms. The only motion allowed to be noticeable.
2. **Seat fill** — empty slot scales 96% → 100% in 180ms when someone joins.
3. **Press** — the button lands 3px down-right, shadow collapses to 1px, 120ms.

**Game-object motions — defined by the game, constrained by the platform.** A game may add motions for its own objects. They must use `--t-fast/base/slow` and `--ease`, explain a state change rather than decorate, not loop, not exceed 260ms, and collapse to an instant state change under `prefers-reduced-motion`. No game-object motion may move chrome.

This game's, for reference — they belong in `docs/games/<slug>.md`, not here:

- **Card lift** (C1) — 8px up on hover or focus, 120ms. A selected card stays lifted.
- **Card played** (C1 → C2) — rack to board in 260ms, shadow collapsing 5px → 0 on landing.
- **Die settle** (C3) — face changes at 60ms intervals for 240ms, then stops. No spinning, no 3D.

**Reduced motion:** everything above becomes an instant state change, except the turn handoff, which keeps a 400ms sun flash on the banner so the change is still noticed.

---

## 10. Voice

Talk like the host, not the software.

- Second person, present tense, contractions on.
- If it doesn't fit on one line at 15px, cut it.
- Name the person, not the role: "Rob's thinking", never "Player 1 is taking their turn".
- Never blame the player. The system dropped, the move didn't fit, the seat filled up.
- No exclamation marks except on a win, and then only one.
- Say what happens next, not what went wrong.

| Don't ship | Ship |
|---|---|
| Waiting for opponent… | Rob's thinking. |
| Connection lost. Reconnecting. | You dropped. Hang tight — your seat's still yours. |
| Invalid move. | That one needs a matching color. |
| Player has abandoned the game. | Yuki's been gone three minutes. Skip her turn? |
| Lobby is empty. | Nobody's here yet. Send the link. |
| Game complete. Final scores below. | Mei took it. 42 points. |
| Are you sure you want to leave? | Leave the table? Your hand goes back in the box. |
| Room full. | All five seats are taken. Want to watch? |

---

## 11. States

A five-player turn-based game is mostly people not being there. **These are the product, not edge cases.** Ship disconnect and rejoin in the same sprint as the table.

| State | Player sees | Rule |
|---|---|---|
| Waiting for your turn | Rack dims to 70%, actions disabled, opponent counts stay live | Never hide the rack |
| Your turn opens | Sun ring moves to your rack, banner flips, one sound, optional push | Pre-selected moves fire here and show what fired |
| Opponent slow | At 60s a nudge button appears on that seat | Any player may nudge, once per turn per player |
| Opponent disconnected | Seat greys, name struck through, "back in a sec" | Hold the seat 3 minutes before offering a skip vote |
| You disconnected | Full-width sun bar, **not a modal** | Never block the board with a reconnect dialog |
| Rejoin | Board restores, then a 3-line "while you were gone" summary | Dismissible; never blocks your turn |
| Turn timeout | The game's declared default action fires, announced in chat | **Contract C4.** The platform guarantees the timeout, the countdown, and the announcement. The *action* is game-supplied — the platform cannot know what "safest legal move" means and must not guess. A game that declares no default action does not get a timeout |
| Game over | Sheet from the bottom: winner, scores, rematch, share | Rematch keeps the same seats and the same link |
| Table abandoned | "Everyone left" plus a rematch link they can send | Never dump someone to a home screen |

---

## 12. Accessibility — acceptance criteria

Treat these as tests, not aspirations.

- [ ] Player identity is triple-coded (color + initial + silhouette); the board is legible in greyscale.
- [ ] Focus is a 3px `--outline` ring at 2px offset, never removed, never replaced by a color change alone.
- [ ] Every interactive target is ≥44×44, including cards in a fanned hand — the tap area extends past the visible card.
- [ ] Turn changes announce via `aria-live="polite"`; the player's own turn opening is `assertive`.
- [ ] Hand counts and turn order are exposed as text, not just visual position.
- [ ] Full keyboard path: arrows move through the hand, Enter plays, Escape deselects.
- [ ] No timer auto-advances without a visible countdown that started ≥10s earlier.
- [ ] No sound-only signals — every audio cue has a visual twin.
- [ ] `prefers-reduced-motion` honored per §9.
- [ ] `<meta name="color-scheme">` present; app is not force-darkened by the browser.

### What can be claimed publicly — status

Marketing must not make accessibility claims from the checklist above; that list is a build target, not a description of today. Current state:

| Criterion | Status | Claimable? |
|---|---|---|
| Contrast pairs verified | Met, measured | Yes |
| Focus ring | Met | Yes |
| Reduced motion honored | Met (token-level) | Yes |
| Not force-darkened; light and dark both first-class | Met | Yes |
| Colorblind-safe player identity | **Not met** — silhouettes for seats 1–5 are specified but not drawn | No |
| 44×44 targets everywhere | Partially met — needs an audit pass per component | No |
| Screen-reader turn announcements | Not built | No |
| Full keyboard play | Not built | No |
| 15px prose floor | **Amended in v1.1** — was unmeetable as written (§4) | Describe as "large, high-contrast type", not as a standards claim |

Rule: a criterion becomes claimable only when it has a passing Playwright or unit assertion attached. Until then it is a roadmap item.

### Verified contrast pairs

| Pair | Ratio | Verdict |
|---|---|---|
| Navy on paper | 14.6:1 | All text |
| Paper on navy (dark) | 14.6:1 | All text |
| Navy on sun | 10.1:1 | All text |
| White on box red | 4.5:1 | Passes AA for normal text at exactly the threshold. Do not darken the red or lighten the text further without re-measuring |
| Box red on paper | 4.1:1 | **Fills only — never body text** |
| Muted ink on surface | 4.8:1 | Labels and captions only |

---

## 12b. The shared link — content spec

The core acquisition moment is someone pasting a link into a group chat. v1 gave this one line, which the marketing brief correctly identified as the highest-leverage and least-defined surface in the product. **Marketing owns the copy in this section; engineering owns the render.**

Implementation on this stack: `packages/client/app/table/[id]/opengraph-image.tsx` using `next/og` `ImageResponse`. Generated per table at request time, 1200×630, no external fonts beyond the two already loaded.

### Required states

| State | Headline | Subline | Visual |
|---|---|---|---|
| **Open, seats left** | `{host}'s table` | `{n} of 5 seats taken · starts when you're in` | Five pawns, filled ones in seat color, empty ones dashed |
| **One seat left** | `{host}'s table` | `Last seat` | Same, four filled |
| **Full, not started** | `{host}'s table` | `All five seats are taken` | Five filled pawns. No "want to watch" until spectators exist |
| **In progress** | `{host}'s table` | `Playing now · turn {n}` | Five filled pawns, no CTA |
| **Finished** | `{winner} took it` | `{score} points · rematch open` | Winner's pawn enlarged |

### Content rules

- **Host name is user-supplied and untrusted.** Truncate at 18 characters, strip newlines, and never render it larger than the platform name. Assume someone will name themselves something hostile.
- No seat *names* other than the host's. Five people's names in a link preview is a privacy leak into a group chat that may include people not at the table.
- Never show hand contents, scores mid-game, or anything a player at the table can't already see.
- **Must read with no images loaded.** Some chat clients render text only; the headline and subline alone have to make sense.
- Fixed 1200×630 with 40px safe margins — most clients crop the edges.
- Per-game variants are permitted and use the **game interior tokens only** (§3); the frame, type, and layout stay platform-owned so every link is recognizably the same product.

### Marketing surfaces — defined or explicitly descoped

v1 reserved `--s8` / `--s9` spacing "for marketing pages only" and then defined none. Status:

| Surface | Status |
|---|---|
| Link preview (above) | Specified. Marketing owns copy |
| Landing page hero | Specified in the visual spec; copy not ratified |
| Page per title | **Descoped for beta.** Depends on §17.2 |
| Press kit | **Descoped for beta.** Needs the product name first |
| App icon / store assets | Specified; blocked on the product name |

---

## 12c. Language

Position, so it's a decision and not an accident: **English only at beta, with strings externalized from day one.**

The voice in §10 is deliberately idiomatic — contractions, possessives, names — and that is expensive to translate. Two engineering consequences that get much more expensive after launch:

1. **No user-facing string literals in components**, even while only English ships. One `en.ts` (or equivalent) keyed by string id. This is nearly free now and a full-codebase sweep later.
2. **Layout must survive a 40% longer string.** German and Finnish routinely run that long, and §10's "fits on one line at 15px" rule will break. Seat chips, buttons, and the turn banner need to wrap or truncate gracefully rather than assume English length — test with a pseudo-locale that pads every string.

Nothing else about i18n is in scope for beta.

---

## 13. Definition of done (per component)

A component is finished when all of the following are true:

1. Uses semantic tokens only — no hex, no magic numbers.
2. Renders correctly with `.dark` on and off, and with the OS setting driving it.
3. All states from §7 implemented, including disabled and loading.
4. Keyboard reachable, visible focus, correct ARIA role and label.
5. Targets ≥44×44.
6. Respects `prefers-reduced-motion`.
7. Legible at 360px wide.
8. No layout shift when a number updates (tabular figures).

---

## 14. Open questions — do not invent answers

Ask before implementing anything that depends on these.

**Blocking — engineering is guessing without these**

- **Product name and wordmark.** Must be original and must not evoke the source title. Use `PRODUCT_NAME` as a placeholder until it lands. Blocks: app icon, store assets, OG tags, page titles, press kit.
- **One look, or a look per game?** Token structure keeps both open (§3), but the answer decides whether game-scoped overrides get built at all. Blocks: nothing today, everything from the second title on.
- **Link-preview copy** (§12b). Marketing owns the text; the render can be built against the table above in the meantime.
- **Game or platform at beta?** Changes page titles, route naming, and whether the landing page sells a title or a service.

**Non-blocking but needed**

- Whether hand size varies during play. A growing rack changes card sizing rules.
- Sound design ownership. "Every cue has a visual twin" is an accessibility constraint on whatever gets made, not a creative direction.
- Piece silhouettes for seats 1–5. Colors are final; shapes are not drawn, and the colorblind-safety claim depends on them.
- Whether the landing hero needs a Display M step between 40px and 24px.

**Resolved since v1**

- Spectators: out of scope for beta (§8).
- The 15px floor vs 11px Micro contradiction: amended (§4).
- Language: English only, strings externalized (§12c).
- Campaign and progression components: specified (§7).

---

## 16. Repo integration — @tabletop/client

### Where things live

| What | Path |
|---|---|
| This spec | `DESIGN.md` (repo root) |
| Tokens | `packages/client/styles/theme.css` |
| Imported from | `packages/client/app/layout.tsx` |

Nothing in this system belongs in `@tabletop/shared`. The server assigns a **seat index**; the client maps index → color, ink, and silhouette. Do not put hex values in shared types — that would put presentation on the wire and make a palette change a protocol change.

The one thing worth adding to `@tabletop/shared` is `MAX_SEATS = 5`, if it isn't there already, since both sides validate against it.

### Root layout

```tsx
import { Archivo, Archivo_Black } from "next/font/google";
import "@/styles/theme.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",           // Archivo Black ships one weight
  variable: "--font-archivo-black",
  display: "swap",
});

export const viewport = {
  colorScheme: "light dark",     // stops browser-forced darkening
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7EF" },
    { media: "(prefers-color-scheme: dark)",  color: "#0E1B2E" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${archivoBlack.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
```

`suppressHydrationWarning` on `<html>` is required if you ship the theme-override script below — that script mutates `className` before React hydrates, and without it every page logs a hydration mismatch.

### Theme override (only if players can pick a scheme manually)

OS preference already works with zero JS via the `prefers-color-scheme` block in `theme.css`. A manual override needs a blocking inline script in `<head>` to avoid a flash:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.classList.add(t)}catch(e){}`,
  }}
/>
```

`.light` and `.dark` on `<html>` both beat the media query. Store nothing and the OS wins.

### Tailwind usage

```tsx
// seat chip
<span className="inline-flex items-center gap-2 rounded-cab border-2 border-outline
                 bg-surface-raised px-2.5 py-1.5 text-small font-medium">
  <i className="size-5 rounded-full border-2 border-outline bg-p1 text-p1-ink" />
  Rob
  <span className="tabular rounded-full border-2 border-outline px-1.5 text-small">4</span>
</span>

// primary button
<button className="press min-h-11 rounded-cab border-2 border-outline bg-accent
                   px-5 py-3.5 font-bold text-accent-ink shadow-print-md">
  Play card
</button>

// display type: phone default, step up at md
<h1 className="font-display uppercase text-display-xl-sm md:text-display-xl">
  Pick a game.
</h1>
```

Note `min-h-11` = 44px, the minimum target from §12.

### Testing

**Vitest + jsdom.** jsdom does not implement `matchMedia`, so anything that reads the scheme throws. Stub it in setup:

```ts
// vitest.setup.ts
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
```

jsdom also does not compute CSS custom properties, so **do not assert on resolved colors in unit tests** — assert on class names. Color correctness is a Playwright job.

**Playwright.** Run the visual-sensitive specs in both schemes; this is the check that would have caught the dark-mode defects:

```ts
projects: [
  { name: "light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
  { name: "dark",  use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
  { name: "mobile-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
],
```

Worth one E2E assertion per scheme that the rack, the active seat ring, and all five player pawns are distinguishable — those are the three things that break when someone adds an arbitrary value.

### CI

The E2E suite runs against a local stack rather than staging, which is fine for this work — everything here is client-rendered and needs no deployed backend. Adding the two scheme projects roughly doubles E2E wall time; if that matters, tag the visual specs and run only those in the dark project.

`npm audit --audit-level=high` as a hard gate is worth knowing before adding any icon or animation library. Don't add one — §6 specifies a hand-drawn 20-icon set precisely so there's no dependency to audit.

---

## 17. Response to the marketing brief

Point-by-point. Three of the six blocking items were spec defects and are fixed; three are brand decisions that cannot be answered from inside engineering.

### 17.1 Product name — **still blocked, correctly**

Cannot be answered here. What has changed: the codename rule is now at the top of this document, `PRODUCT_NAME` is the mandated placeholder so a grep finds every instance, and a CI check is recommended. The originality constraint — no evocation of the source title, no source art or rulebook wording — is now rule §0.7 and applies to every string an agent writes, not just the name.

### 17.2 One look, or a look per game — **answered structurally, decision still yours**

The brief is right that v1 implied total uniformity. The tokens are now split into a **platform frame** and a **game interior** (§3). Today both resolve to the same values, so nothing looks different and nothing costs anything. When the answer arrives:

- *One product with modes* → the game layer is never overridden. Zero work.
- *Titles under a brand* → a second title overrides the game layer only, scoped to `[data-game]`. The frame stays constant, so the platform is still recognizable.

Either way the decision no longer requires a token rewrite, which is what made it urgent. It is now a marketing decision on a marketing timeline. **What it still gates:** whether we build a per-title landing page and per-game link previews.

### 17.3 Link preview — **fixed, and marketing owns the copy**

Now fully specified in §12b: five states, per-state headline and subline, host-name truncation and hostile-input handling, a rule against showing other players' names, and a requirement that it reads with images disabled. The render target is `opengraph-image.tsx` on the existing Next stack. Engineering can build against the state table while copy is being written.

### 17.4 Game or platform at beta — **still blocked**

Genuinely a positioning decision. Engineering impact is small and late: page titles, route naming, and whether the landing page sells a title or a service. Not blocking component work.

### 17.5 Spectators — **fixed**

The brief caught a real contradiction. Out of scope for beta. The spectator render rule stays as the definition for when they are built, and the "Want to watch?" string is pulled from the room-full message until then (§8, §10).

### 17.6 Sound — **out of scope here, and worth saying why**

"Every cue has a visual twin" is an accessibility constraint on whatever sound design happens, not a creative brief. This spec takes no position on ownership. One thing to note: if sound is in scope for trailers or demos, the constraint means the product cannot rely on audio to convey turn changes — so a trailer that leads on sound is showing something the product deliberately does not depend on.

### 17.7 Voice — **ratification requested, and one change already made**

The voice guide is §10 and is unchanged apart from removing the spectator offer. It is currently owned by engineering by default, which the brief is right to flag. Two things worth deciding rather than inheriting: whether it extends to marketing surfaces (recommendation: yes, with permission to be louder in a hero than the product is in an error state), and who reviews new strings.

### 17.8 Language — **fixed as a decision**

§12c: English only at beta, strings externalized from day one, layout tested against a 40%-longer pseudo-locale. The second point matters more than it sounds — §10's one-line-at-15px rule breaks in German, and the components affected are being built right now.

### 17.9 Accessibility claims — **agreed, and now enumerated**

§12 has a status table separating what is met and measured from what is a build target. Four criteria are claimable today; five are not. The brief was also right that one criterion could not be met as written: the 15px prose floor contradicted the 11px Micro style used for player-facing labels. Amended in §4, with a new rule that numbers a player acts on never use Micro.

### 17.10 Third-party assets — **already a rule, now with the reason**

§6 and §0. The 20-icon set is hand-built specifically so there is no dependency to license or audit, which matters given `npm audit --audit-level=high` is a hard CI gate.

### 17.11 Progression — **real gap, wrong document**

The brief is right that per-player mission progress is a live retention hook absent from any marketing narrative. It is not, however, a platform design concern: `MISSION_CONFIGS` is game configuration, so mission cards, campaign maps, and lock affordances are **game components** and belong in that game's spec, not here. v1.1 briefly added them to the platform inventory; v1.2 moves them out and adds the platform/game component test in §7 that should have caught it.

What this spec now owes progression: the game-interior token layer, the play region, and every inherited rule (§8b). What is still genuinely platform and still missing: the surface a player sees progress *on*, once more than one game has any — the shelf, not the missions. That should wait for a second game rather than be abstracted from one.

The marketing point survives all of this intact: **beta is a campaign of missions, not "one game,"** which is a materially different thing to position (§17.4).

### 17.12 Marketing pages — **defined or explicitly descoped**

§12b closes the loop on the reserved spacing: link preview and landing hero are in, per-title pages and press kit are descoped for beta and named as such rather than left implied.

### 17.13 Rules were still stated as universals — **fixed in v1.3**

v1.2 split tokens and components but left the rules assuming this game's mechanics. Four were stated as platform universals that a second game could violate while still feeling like our product:

| Was stated as a universal | Now |
|---|---|
| The rack is pinned, never scrolls, holds every turn action | **C1**, conditional on the game having private state. A game with no hidden state has no rack |
| Hidden information is "a player's hand"; backs are face-down cards | **C1**, generalized to private state — a hand, a private objective, a bid, or nothing. Restated as a wire-format rule, not a UI one |
| 7° tilt, flatten toggle, pan/zoom, play-area max widths | **C2**, conditional on a spatial play surface. A boardless game is unaffected |
| Die settle is one of "the five motions that ship" | **C3**. Motion is now three platform motions plus game-object motions the game defines under platform constraints |

Plus a fifth that was worse than the other four: **turn timeout auto-passed "the safest legal move."** The platform cannot know what safe means in a game it does not model. Now **C4** — the platform guarantees the timeout, countdown, and announcement; the game supplies the action, and a game that declares none gets no timeout.

§2b adds the test that should have caught all of them: *could a second game with no hidden hand, no randomizer, and no board violate this rule and still feel like our product?* If yes, it is a contract, not an invariant.

---

## 15. Provenance

Cabinet was selected from three design territories. The other two — **Felt & Walnut** (tactile, hobbyist, 18° tilt) and **Console** (flat, competitive, replay-driven) — remain fully specified at territory level, including both schemes and all tokens, in case of a pivot. Do not blend them into Cabinet; they are alternatives, not a palette to borrow from.
