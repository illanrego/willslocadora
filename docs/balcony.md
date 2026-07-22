# The Balcony — frontend-first counter prototype

**Status:** approved next visual/UI experiment. Build with local UI state first; no database or public backend is required.
**Purpose:** turn Locadora’s existing browse → counter → Stremio experience into a tangible 3D rental ritual before adding other product layers.

## Core rule

There is no `Separados` / Picks shelf.

The Balcony has one pre-rental title collection: **Balcão**. A tape reaches Balcão when the visitor deliberately adds it from a VHS detail view. These are the titles currently being considered for the next rental.

```text
browse a VHS
  → add it to Balcão
  → click Alugar
  → local state changes from counter to rented
  → return it later through the return area
```

This is a frontend/local-state prototype. Its job is to test the 3D room, tape piles, actions, and emotional logic—not to simulate payment, inventory, or a real account yet.

## Spatial composition

The Balcony is a fixed upstairs/mezzanine counter overlooking the main Locadora shelves. The visitor reaches it through a deliberate camera transition, not free-roam movement.

It should look like a real Brazilian video-store counter after dark: practical, a little crowded, warm, and worked-in rather than polished or minimalist. The reference photos establish the direction:

- visibly tall, imperfect piles of VHS cases on the counter;
- dense tape walls and posters behind the desk;
- plain painted/laminate counter surfaces, metal railing, paper notices, and small store clutter;
- an old CRT computer seen from **behind**—a physical staff-side object, not a dashboard screen facing the visitor;
- warm fluorescent/amber practical light with restrained blue spill from the shop floor;
- membership paperwork/card cues and a physical return area.

## Required Balcony elements

### 1. Balcão — the pile to rent

This is the primary interactive pile/crate on the counter. It contains every title the visitor is considering for the upcoming rental.

- Add a title from its VHS detail via an explicit `Add to Balcão` action.
- On the Balcony, each tape remains individually inspectable and removable.
- The pile should feel physical: tapes can be stacked, slotted in a crate, or leaned against one another. Its height/density should visibly respond to the number of titles.
- A compact visible count helps the visitor understand their selection without becoming a cart UI.
- It is not a reservation, an inventory lock, a claim of playback, or a payment checkout.

### 2. Rent action

A clear physical desk action—button, stamped receipt control, or counter bell—runs `Alugar`.

For this prototype:

- `Alugar` moves every title currently in Balcão from `counter` state to `rented` state in local UI state.
- The physical response matters: animate the pile being processed, print/slide out a fake receipt, then pack the tapes into a Locadora plastic bag.
- The bag occupies the **same exact counter position** previously used by the Balcão pile. It becomes the visible active-rental object: the counter has been cleared because the visitor is taking that rental home.
- Use a slightly translucent white/cream plastic bag with the Locadora mark, handles, believable VHS silhouettes/spines, and the receipt peeking out. It should feel like a real video-store handoff, not a shopping-cart icon.
- Selecting the bag starts the return flow for its tapes. Returning the last tape removes the bag and leaves the counter ready for a new Balcão pile.
- Do not enforce a package limit yet. We will learn from the space whether two, three, or a small flexible stack feels right.
- Do not show money/payment handling. The rental ritual is free and simulated.

### 3. Devoluções — return pile / return chute

Include a clearly separate physical return location: a drop slot, wire basket, or visibly growing `DEVOLUÇÕES` pile.

- Selecting a rented tape opens a tiny return choice: `watched`, `not watched`, or `unknown`.
- Confirming moves that tape out of `rented` state into a local returned/recorded state and creates the satisfying visual of a tape entering the return area.
- The return area should read as operational store texture, not as a warning or late-fee system.
- No playback assumptions: `not watched` is an honest result, not a penalty.

### 4. Membership desk

Include a modest physical membership cue:

- brass or laminated `Seu Cartão` plaque / card holder;
- a small stack of blank rental cards or membership forms;
- later it will show the signed-in username, but the prototype can use a local mock name;
- it is not a public profile or social feature.

### 5. CRT computer, seen from behind

The counter includes an old beige/black CRT monitor, keyboard, cables, and perhaps a receipt printer.

- The visitor primarily sees its rear shell and screen glow from the staff side, as in a real counter—not a big product UI screen.
- It makes the counter feel operated and real.
- It should not become a second dashboard or canvas-only control surface.
- The receipt printer can support the `Alugar` animation later.

### 6. Voluntary 3D tip jar

The tip jar is a separate countertop object, never mixed into Balcão, rental, or return actions.

- Text: `Mantenha as luzes da Locadora acesas.`
- Prototype interaction may be a rattle/coin animation and an informational thank-you panel; it need not link to a donation service yet.
- Later it can open an explicit external voluntary donation flow.
- It must never gate rentals, catalogue access, reviews, import/export, recommendations, or core personalization.

Potential permanent thank-you/supporter outcomes are documented here for later, not required for the prototype:

- supporter stamp on the rental card;
- cosmetic card variants, VHS labels/stickers, and store-light/ambience presets;
- a private personal display shelf based on rental history;
- optional username or anonymous credit in a “keeping the lights on” wall;
- collective tip milestones that add store ambience or visual upgrades for everyone.

No amount hierarchy, recurring obligation, paid tier, or functional advantage.

## Supporting props worth adding

Use these only if they improve the feeling without making the room visually noisy:

- a handwritten rental-rules / weekend-hours sign;
- receipt-printer paper roll and a few old receipts;
- a small desk bell or stamp as the physical `Alugar` affordance;
- VHS rewinder, barcode scanner, tape labels, membership forms, pens, and price stickers;
- framed staff-pick/poster ephemera and dense tape walls behind the counter;
- a small fan, fluorescent fixture, or extension cables for lived-in texture.

Avoid adding a staff character, payment terminal, real cash register/payment flow, social feed, or a second full catalogue shelf.

## Local prototype state model

No backend is necessary. Start with one title state and a few UI actions:

```text
available → counter → rented → returned
```

- `available → counter`: Add to Balcão from a title detail.
- `counter → available`: Remove from Balcão.
- `counter → rented`: `Alugar` processes the current Balcão pile.
- `rented → returned`: choose watched / not watched / unknown and confirm the return.

Persisting this state in `localStorage` is allowed solely to support playtesting across refreshes. It is disposable prototype state, not a local substitute for the future public data model.

## Interaction and accessibility rules

- Enter Balcony through one explicit camera target/transition; no WASD/free-roam.
- Every tape action has a normal accessible DOM control in addition to any 3D object interaction.
- The ordinary shelves remain the discovery interface; the Balcony is where selection, rental, and return become visible.
- No element may imply a title is available to stream, reserved, or paid for.

## Acceptance questions after the UI prototype

1. Does a tall/personal Balcão pile make selecting titles feel more like a rental ritual than a generic cart?
2. Is `Alugar` understandable as an enjoyable state change even without payments or backend persistence?
3. Is returning a tape clear and satisfying?
4. Does the bag in the former Balcão position make the rented state immediately clear without adding clutter?
5. Does the CRT/counter composition feel like a real Locadora rather than a game menu?
6. Does the tip jar feel warmly optional and clearly separate from renting?
