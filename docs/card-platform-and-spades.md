# Reusable Card Platform and Spades Plan

This document defines the boundary between the reusable card platform and
individual games. It applies to work on `ben-game-sandbox`.

## Core rule: a standard deck never changes

The canonical deck is always:

- 4 suits: clubs, diamonds, hearts, spades
- 13 ranks per suit: 2 through 10, jack, queen, king, ace
- 52 cards total
- no jokers unless a game explicitly adds a separate expansion

Games may interpret cards differently, but they do not rewrite the deck.
Trump, scoring, wild cards, rank order, and point values are game rules.

## Multiple decks

`createStandardShoe({ decks: N })` creates `N` complete copies:

| Multiplier | Cards |
| ---: | ---: |
| 1 | 52 |
| 2 | 104 |
| 3 | 156 |

Every generated card has a unique instance ID and a `deckIndex`, so two
copies of the ace of spades remain distinguishable in games that use more
than one deck.

## Reusable card engine responsibilities

The module at `packages/shared/src/cards` owns only broadly reusable
card behavior:

- immutable standard-deck definition
- creation of one or more deck copies
- unique instance identity
- non-mutating shuffle
- round-robin deal
- validation of deck counts and deal sizes

It deliberately does not know about Spades, Poker, Go Fish, Pitch, or any
other game's rules. This keeps it safe to reuse in future builds.

## Spades v1

Spades uses exactly one standard 52-card deck and always has four seats.

| Humans | Bots | Total seats |
| ---: | ---: | ---: |
| 1 | 3 | 4 |
| 2 | 2 | 4 |
| 3 | 1 | 4 |
| 4 | 0 | 4 |

Seats and partnerships:

- North + South
- East + West

The lobby accepts one to four humans. Empty seats are filled by bots when
the host starts the game. Every seat receives 13 cards.

### Bot and generated names

Every computer-controlled player and every automatically generated guest
identity receives a random, family-friendly first name that is similar in
feel to the first names of characters from Disney animated movies. Names must
be unique within the current room. Human-entered names are never replaced.

The curated name pool uses original or common first-name variants rather than
full character names, titles, movie names, copied dialogue, or character
artwork. Name generation belongs to the player/game platform and never to the
reusable card module.

### Planned round state

1. Lobby and seat assignment
2. Shuffle and deal
3. Bidding, clockwise
4. Trick play, clockwise
5. Round scoring
6. New round or final result

### Winning score options

The host chooses the target score before starting the game:

| Game length | Target score | Purpose |
| --- | ---: | --- |
| Quick Game | 250 | Shorter session |
| Standard Game | 500 | Default Spades game |
| Long Game | 750 | Extended session |

The selected target score is part of the Spades game configuration. It does
not change the deck, deal, partnerships, or per-round scoring rules.

### Nil and blind nil

Both nil and blind nil are included in Spades v1:

| Bid | Success | Failure |
| --- | ---: | ---: |
| Nil | +100 | -100 |
| Blind nil | +200 | -200 |

A nil bidder is trying to take zero tricks. A blind-nil bid must be declared
before that player views their hand. The bidder's partner still makes a normal
bid. Nil bonuses and penalties are added to the partnership's ordinary hand
score; tricks taken by a failed nil bidder still count toward the partnership's
trick total and may create bags.

### Books and bags

A partnership that makes its combined bid scores 10 points for each bid trick.
Each overtrick scores 1 additional point and adds one bag to the partnership's
running bag total. Every time the accumulated total reaches 10 bags, the
partnership loses 100 points; 10 bags are removed and any remainder carries
forward. For example, moving from 9 bags to 12 applies the penalty and leaves
2 bags.

### Dealer and opening lead

The dealer position rotates clockwise after every hand. The player immediately
to the dealer's left leads the first trick. Holding the 2 of clubs does not
override seat order or determine the opening leader.

### Following suit and breaking spades

Players must follow the suit led whenever they hold a card of that suit. If
they cannot follow suit, they may play any card, including a spade. The first
spade played while unable to follow suit breaks spades for the hand. A player
cannot lead spades before they are broken unless every card remaining in their
hand is a spade.

### Planned Spades rule layer

The Spades engine will own:

- legal bids
- nil and blind-nil bid validation and scoring
- opening lead and follow-suit validation
- when spades become broken
- trick winner calculation
- partnership bids and tricks
- books, bags, penalties, and winning score
- bot bidding and card-play decisions

None of those rules will be added to the reusable card module.

## Existing platform pieces to retain

The current repository already provides useful game-platform infrastructure:

- player profiles
- private rooms and join codes
- lobby readiness
- live WebSocket updates
- reconnect support
- PostgreSQL persistence
- client, server, and shared TypeScript workspaces
- automated unit and browser testing patterns

The wire-game-specific state and interface will be replaced incrementally on
this branch. Caroline's `main` branch is not part of this work.

## Decisions still to make

Before Spades scoring is implemented, settle:

- whether sandbagging or special house rules are enabled
- bot difficulty levels
- whether players choose seats or are assigned automatically

These are configuration decisions in the Spades layer, not changes to the
standard deck.
