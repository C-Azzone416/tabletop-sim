# Cabinet — Design System Spec

Authoritative design spec for the board game platform UI. Written to be read by a coding agent working in this repo.

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
7. Ask before deviating. This spec is opinionated on purpose; the tradeoffs behind each rule are documented where they're non-obvious.

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

## 3. Color

Values live in `theme.css`. Rules:

- **`--outline` is the most-used token in the system.** Every interactive surface has one.
- **`--accent` (box red) is a fill color only.** It fails contrast as body text on paper (4.1:1). Use `--ink` for text.
- **`--warning` (sun) always takes `--ink` on top, never white.**
- **Elevation is a printing offset, not a light source.** Every shadow in a screen points down-right at the same distance. Never blur.
- **Dark is a translation, not an inversion.** Two rules exist only in dark, both documented in the token file: `--shadow` goes *darker* than the surface, and internal rules use `--line-soft` rather than full-strength `--outline`.

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
- **15px is the floor** for anything a player reads, including on a phone.
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

Build in this order — each tier depends on the one above.

**P0 — table is unplayable without these**

| Component | Required variants and states |
|---|---|
| Button | primary, secondary, yellow, danger, ghost · lg/md/sm · hover, active, focus, disabled, loading |
| Seat chip | active, next, waiting, disconnected, empty, spectator |
| Rack | cards, tiles, dice, empty · your-turn vs waiting |
| Card / tile / piece | face-up, face-down, selected, illegal, just-played |
| Turn banner | your turn, their turn, paused, game over |
| Board surface | tilted, flat, zoomed |
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

### Rack rules

- **Yellow means yours.** The rack is the only surface painted `--surface-rack`; it is the privacy signal.
- Never scrolls, never collapses, never hides — a dimmed rack still tells a player what they're holding.
- Holds *every* action available on the player's turn: play, draw, pass, undo.

---

## 8. The table

- **Tilt is 7°** by default, 0° with the flatten toggle, and eases to 0° when a tile is zoomed. **Tilt never animates during a turn.**
- **Seat rail across the far edge**, ordered by turn. Active seat expands; others collapse to pawn, name, count.
- **Rack pinned to the bottom**, full width. On mobile it owns the bottom third — the thumb zone. No turn action may live in a top bar.
- **The board is what moves.** Pan and zoom act on the table only; chrome stays put.

### Z-order

| Layer | Contents |
|---|---|
| 0 | Background field (halftone) |
| 10 | Table surface |
| 20 | Pieces, tiles, played cards |
| 30 | Seat rail |
| 40 | Rack — always above the table |
| 50 | Toasts, tooltips, chat |
| 60 | Modals, game-over sheet |

### Seat counts

| Players | Far edge | Board max | Watch for |
|---|---|---|---|
| 2 | One chip, expanded, centered | 640px | Feels empty — give the opponent presence, not more chrome |
| 3 | Two chips, centered | 600px | — |
| 4 | Three chips | 560px | Names begin truncating on phones |
| 5 | Four chips, compact | 520px | ~80px per chip at 360px wide |

### Hidden information (security-relevant)

- A player's hand is **rendered only on that player's client**. The server sends other clients a *count*, never contents.
- Face-down backs use `--info` and carry no identifying mark.
- Spectators see exactly what an empty seat would see.

---

## 9. Motion

Chrome stays still. Only game objects move, and only to explain something that happened. Nothing loops, floats, or pulses for attention.

| Duration | Use |
|---|---|
| `--t-fast` 120ms | Hover, press, focus — anything the player caused directly |
| `--t-base` 180ms | Card lift, seat state change, toast in |
| `--t-slow` 260ms | Turn handoff, dealing, game-over sheet |

Easing is `--ease` for everything except timers, which are **linear** — a clock that eases is a lie.

The five motions that ship:

1. **Card lift** — 8px up on hover or focus, 120ms. A selected card stays lifted.
2. **Card played** — rack to board in 260ms, shadow collapsing 5px → 0 on landing.
3. **Die settle** — face changes at 60ms intervals for 240ms, then stops. No spinning, no 3D.
4. **Turn handoff** — banner slides 12px, the sun ring moves to the next seat, 260ms. The only motion allowed to be noticeable.
5. **Seat fill** — empty slot scales 96% → 100% in 180ms when someone joins.

**Reduced motion:** all five become instant state changes, except the turn handoff, which keeps a 400ms sun flash on the banner so the change is still noticed.

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
| Turn timeout | Auto-pass with the safest legal move, announced in chat | Never silently forfeit — always say what was played |
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

### Verified contrast pairs

| Pair | Ratio | Verdict |
|---|---|---|
| Navy on paper | 14.6:1 | All text |
| Paper on navy (dark) | 14.6:1 | All text |
| Navy on sun | 10.1:1 | All text |
| White on box red | 4.5:1 | 16px+ bold only |
| Box red on paper | 4.1:1 | **Fills only — never body text** |
| Muted ink on surface | 4.8:1 | Labels and captions only |

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

- Product name and wordmark. The app icon currently uses a placeholder box mark.
- Whether hand size varies during play. A growing rack changes card sizing rules.
- Whether spectators exist at launch.
- Sound design. Currently specified only as "every cue has a visual twin".
- Piece silhouettes for seats 1–5. Colors are final; the shapes are not drawn yet.
- Whether the landing hero needs a Display M step between 40px and 24px.

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
  <span className="tabular rounded-full border-2 border-outline px-1.5 text-[11px]">4</span>
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

## 15. Provenance

Cabinet was selected from three design territories. The other two — **Felt & Walnut** (tactile, hobbyist, 18° tilt) and **Console** (flat, competitive, replay-driven) — remain fully specified at territory level, including both schemes and all tokens, in case of a pivot. Do not blend them into Cabinet; they are alternatives, not a palette to borrow from.
