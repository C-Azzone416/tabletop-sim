# Design System — Platform Spec

Values live in `packages/client/styles/theme.css`. Reasoning, code samples, the link-preview content spec, and the marketing response live in `DESIGN-APPENDIX.md`. This file is the working document.

> **"Cabinet" is an internal codename, not a product name.** Never in the UI, a URL, a page title, or an OG tag. Use the literal string `PRODUCT_NAME` as a placeholder so a grep finds every instance.

---

## Rules for the agent

1. No hex, no arbitrary Tailwind values (`bg-[#E43126]`, `text-[17px]`). Use the generated utilities.
2. Missing token? Add it to `theme.css` with both light and dark values, then note it under Open questions.
3. Every component must work in both schemes without knowing which is active. If it needs a mode check in JS, the tokens are wrong.
4. No third font, no gradient, no blurred shadow, no radius above 6px.
5. No user-facing string literals in components — strings are externalized even though only English ships.
6. This product is a digital adaptation of a published board game. Mechanics aren't protected; names, art, and text are. Everything named, drawn, or written here must be original.
7. Ask before deviating.

---

## Platform vs game

Three layers, one split. The platform owns the frame; a game owns what's inside it.

| | Platform owns | Game owns |
|---|---|---|
| **Tokens** | surface, ink, outline, shadow, accent | table, rack, pieces, seat colors (`--game-*`) |
| **Components** | buttons, seat chips, toasts, modals, lobby, chat, invite | board, pieces, hand, campaign, anything config-driven |
| **Rules** | invariants | contracts (below) |

A game may not restyle a dialog, add a typeface, or override platform spacing.

### Contracts — rules that apply only if the game has the mechanic

Each game declares which it triggers, in `docs/games/<slug>.md`.

| | Applies when | Platform requires |
|---|---|---|
| **C1 Private state** | Some state is visible to one player only | The server never sends a client any state that player is not entitled to. The *projection* is game-defined — a count, nothing, or a redacted per-element view. Whatever the projection, an attribute that carries rules meaning is never included for concealed elements — and a concealed representation's color is drawn from outside the game's object palette, never a semantic token like `--info` that could double as a rule-bearing color elsewhere in the game. Lives on its own surface, pinned, never scrolls, holds every action available on that turn |
| **C2 Play surface** | The game has a board or map | 7° tilt with a flatten toggle; tilt never animates during a turn; pan/zoom act on the surface only; max width 640/600/560/520px at 2/3/4/5 players |
| **C3 Randomizer** | Dice, draws, shuffles | Resolves in discrete steps ≤260ms, no spinning. Result readable as text before the animation ends |
| **C4 Turn default** | Always | Platform guarantees the timeout, countdown, and announcement. **The game supplies the action taken.** No declared action means no timeout |
| **C5 Targeted opponents** | A turn action targets a specific element of another player's state | Every seat renders at element-level granularity, not a count. The active seat is distinguished by emphasis, not by being the only expanded one. Element positions are stable and never reorder while the game is live |
| **C6 Dense private state** | Max holdings × 44px exceeds the surface width at the minimum viewport | The game names its resolution rather than improvising per component. Default order of preference: wrap to a second row first; if density still exceeds the floor after wrapping, tap targets may overlap their neighbor (already permitted for fanned cards); only relax the 44×44 floor itself as a last resort, and only for the specific over-dense case |

Test for anything new: *could a game with no hidden hand, no randomizer, and no board violate this and still feel like our product?* If yes, it's a contract, not an invariant.

---

## Color

- `--outline` is on every interactive surface. It's the identity.
- `--accent` (red) is **fill only** — it fails contrast as body text.
- `--warning` (sun) always takes `--ink` on top, never white.
- Shadows are hard offsets, never blurred, always down-right, same distance per screen.
- Dark is a translation, not an inversion. Two dark-only rules: `--shadow-ink` goes *darker* than the surface, and internal rules use `--line-soft` rather than the full outline.

**Player seats** — `--p1`…`--p5`, assigned in join order, never reassigned mid-game. Color is never the only signal: every seat carries **color + initial + silhouette**. The board must read in greyscale.

---

## Type

Archivo Black shouts, Archivo reads. No third family; numerals stay in-family with tabular figures.

| Role | Class | Size / line | Tracking | Used for |
|---|---|---|---|---|
| Display XL | `text-display-xl` | 56 / 54 | -3.5% | Hero, game over |
| Display L | `text-display-l` | 40 / 40 | -3% | Lobby title |
| Heading | `text-heading` | 24 / 26 | -2% | Modal titles |
| Subhead | `text-subhead` | 19 / 26 | -1% | Turn banner, seat names |
| Body L | `text-body-l` | 17 / 26 | 0 | Rules, onboarding |
| Body | `text-body` | 15 / 23 | 0 | Chat, default UI |
| Small | `text-small` | 13 / 18 | 0 | Seat chips, counts |
| Micro | `text-micro` | 11 / 14 | +14% | Labels only |
| Numeric | `.tabular` | inherits | 0 | Scores, counts, clocks |

- Sentence case except Display and Micro, which are caps. Micro is the only tracked style; never letterspace lowercase.
- **15px floor for prose.** Micro is for non-essential labels only, and anything conveyed only in Micro must exist elsewhere.
- **Numbers a player acts on are 13px minimum** — never Micro. A misread count changes a decision.
- One Display per screen. Display may wrap; it may not shrink below 31px on a phone.

---

## Space, shape, elevation

Spacing is Tailwind's default 4px scale — don't add custom tokens.

| | Value |
|---|---|
| Radius | 2px pieces · 4px default · 6px dice · pill for counts only |
| Outline | 2px standard · 3px play-surface frame, private surface, primary CTA |
| Shadow | `shadow-print-sm/md/lg` = 3/5/8px offset, zero blur |

---

## Icons

24px grid, 2.4px stroke, square caps and joins, geometric construction. Stroke never changes — scale the box, not the weight.

`seat` `dice` `hand` `turn` `timer` `chat` `invite` `players` `winner` `undo` `pass` `settings` `sound` `spectate` `shuffle` `nudge` `copy` `confirm` `close` `alert`

`stroke: currentColor`, `fill: none`, never two colors inside one icon. **Icon-only buttons are forbidden for pass, undo, and leave.**

---

## Components — platform, build in order

**P0** — Button · Seat chip · Private surface (C1) · Game object · Turn banner · Play surface (C2) · Lobby seat slot · Invite card

**P1** — Toast · Modal · Chat · Scoreboard

**P2** — Empty states

Key rules:
- One primary button per screen. Press lands it 3px down-right, shadow to 1px. Minimum target 44×44.
- The active seat carries a 3px sun ring — **the only place that ring is used anywhere.**
- Seat chips sit in turn order, left to right, and never reorder mid-game. Below 380px the name truncates before the count does.
- **The rack tint means yours.** The private surface is the only one painted `--game-rack`; that's the privacy signal. This rule used to read "yellow means yours", and the wording was the defect (#245): `--game-rack` was set to the same hex as a yellow wire, so the privacy cue and a rule-bearing game value were indistinguishable on a surface made of wire tiles. The tint is a deep amber that no wire wears. **A wire colour may never carry a non-wire meaning** — see DESIGN-APPENDIX §3.

---

## Layout

**Invariant:** seat rail across the far edge in turn order; no turn action ever in a top bar; on mobile actions live in the bottom third; chrome never moves.

**Z-order:** 0 background · 10 shared play surface · 20 game objects · 30 seat rail · 40 private surface · 50 toasts and chat · 60 modals.

**Seat counts:** 2 players feels empty — give the single opponent presence, not more chrome. At 5, each chip gets ~80px on a 360px screen; pawn and count survive, the name gives.

---

## Motion

Chrome stays still. Only game objects move, and only to explain something. Nothing loops or pulses.

`--t-fast` 120ms (press, hover, focus) · `--t-base` 180ms (default) · `--t-slow` 260ms (handoff, game over). Easing `--ease`, except timers, which are linear.

**Platform motions:** turn handoff (banner slides 12px, ring moves, 260ms — the only motion allowed to be noticeable) · seat fill (96%→100%, 180ms) · press.

**Game-object motions** are defined by the game and must obey these timings, not loop, not exceed 260ms, not move chrome, and collapse to instant under `prefers-reduced-motion`.

---

## Voice

Second person, present tense, contractions on. Name the person, not the role. Never blame the player. No exclamation marks except on a win, and then one.

| Don't ship | Ship |
|---|---|
| Waiting for opponent… | Rob's thinking. |
| Connection lost. Reconnecting. | You dropped. Hang tight — your seat's still yours. |
| Invalid move. | That one needs a matching color. |
| Player has abandoned the game. | Yuki's been gone three minutes. Skip her turn? |
| Lobby is empty. | Nobody's here yet. Send the link. |
| Game complete. Final scores below. | Mei took it. 42 points. |
| Are you sure you want to leave? | Leave the table? Your hand goes back in the box. |
| Room full. | All five seats are taken. |

---

## States

A five-player turn-based game is mostly people not being there. **Ship disconnect and rejoin in the same sprint as the table.**

| State | Player sees | Rule |
|---|---|---|
| Waiting for your turn | Private surface dims to 70%, actions disabled | Never hide it — a dimmed rack still says what you're holding |
| Your turn opens | Ring moves, banner flips, one sound | Pre-selected moves fire here and show what fired |
| Opponent slow | Nudge button appears at 60s | Any player may nudge, once per turn per player |
| Opponent disconnected | Seat greys, name struck through | Hold the seat 3 minutes before offering a skip vote |
| You disconnected | Full-width sun bar, **not a modal** | Never block the board with a reconnect dialog |
| Rejoin | Board restores, then a 3-line "while you were gone" | Dismissible, never blocks your turn |
| Turn timeout | The game's declared default action fires, announced in chat | Never silently forfeit — always say what was played |
| Game over | Sheet from the bottom: winner, scores, rematch, share | Rematch keeps the same seats and the same link |
| Table abandoned | "Everyone left" plus a rematch link | Never dump someone to a home screen |

---

## Accessibility

Build targets, not current state.

- [ ] Player identity triple-coded; board legible in greyscale
- [ ] Focus is a 3px `--outline` ring at 2px offset, never removed
- [ ] Targets ≥44×44, including cards in a hand
- [ ] Turn changes announce via `aria-live="polite"`; your own turn is `assertive`
- [ ] Counts and turn order exposed as text, not just position
- [ ] Full keyboard path: arrows through the hand, Enter plays, Escape deselects
- [ ] No timer auto-advances without a countdown visible ≥10s earlier
- [ ] No sound-only signals
- [ ] `prefers-reduced-motion` honored
- [ ] `colorScheme: "light dark"` set in the root layout — without it browsers force-darken the app and wreck the player colors

**Claimable publicly today:** contrast pairs, focus ring, reduced motion, light/dark both first-class. **Not yet:** colorblind-safe identity (silhouettes undrawn), 44×44 everywhere, screen-reader announcements, keyboard play. A criterion becomes claimable when it has a passing test attached.

**Contrast:** navy on paper 14.6:1 · paper on navy 14.6:1 · navy on sun 10.1:1 · white on red 4.5:1 (at the threshold — don't adjust either without re-measuring) · red on paper 4.1:1, **fills only**.

---

## Definition of done, per component

Semantic tokens only · both schemes · all states including disabled and loading · keyboard reachable with visible focus · ≥44×44 · respects reduced motion · legible at 360px · no layout shift when a number updates.

---

## Open questions — do not invent answers

**Blocking**
- **Product name and wordmark.** Original, must not evoke the source title. Blocks app icon, store assets, OG tags, page titles.
- **The C4 default turn action.** Without it a disconnected player stalls the table indefinitely.

**Needed, not blocking**
- One look, or a look per game? (Token structure keeps both open, so this can wait.)
- Piece silhouettes for seats 1–5 — blocking the colorblind-safety claim.
- Whether hand size varies during play.
- Link-preview copy — state table is in the appendix.
- Sound design ownership.

**Resolved:** spectators out of scope for beta · English only, strings externalized · 15px floor amended.
