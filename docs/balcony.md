# The Balcony — implemented rental counter

**Status:** implemented in the 2D and 3D experiences. The signed-in rental state is authoritative in the private `locadora-data` Worker; the anonymous basket remains local until confirmation.
**Purpose:** make Locadora’s browse → Cesta → Balcão rental → return loop tangible, legible, and identical in normal and immersive modes.

## Streaming-discovery UX update

The rental metaphor supports choosing films and series from the visitor's subscriptions. “Seus streamings” is visible and optional; new subscription browsing defaults to all years while explicit saved preferences are respected. Cesta remains fixed on screen in normal and immersive navigation with an exact count and up to three decorative tape spines. Adding titles uses a transient live announcement, not a mandatory confirmation window.

Rental success now opens “🍿 Boa sessão!” with the tape cards and independently loaded service destinations. The same “Ver streamings” panel is public from title details and reachable from active rentals. Failed link extraction leaves an explicit TMDB fallback and never changes rental state. Closing a support or service panel restores focus to its origin without closing the rental confirmation.

All support controls, including the 3D jar, now open one optional anonymous Pix panel. Quiet entries remain available across browsing and modal flows; the rental ending gives a warmer invitation below service options. Configure the public Pix key and QR-image path using [the setup instructions](donations.md). The jar shows a simple Pix label until configured, never a demonstration QR. This update supersedes the prototype donation behavior below.

## Core rule

There is no `Separados` / Picks shelf.

There is one physical customer-facing space: the Balcão. Its two operations use separate windows:

- **Aluguel:** the Cesta-to-Balcão decision window. It reviews the titles being picked for the package and is the only place where rental is confirmed.
- **Devoluções:** a separate return window. It only shows active rented tapes and their watched-state choices.

The catalogue search window is separate from both operations. It only finds titles and never mixes rental or return options into the search surface.

The pre-rental flow keeps two separate states:

- **Cesta local:** up to fifteen distinct titles chosen while browsing or searching the catalogue. It persists locally until the visitor removes titles or the relevant rental flow completes.
- **Decisão no Balcão:** a temporary copy of the Cesta. Removing a tape here means “não levar hoje” and does not mutate the Cesta itself. Only this temporary subset is sent when the visitor confirms `Alugar pacote`.

A tape reaches Cesta only when the visitor deliberately adds it from a VHS detail view. The normal and immersive Cesta buttons open the same review surface; `Levar ao Balcão` then opens the 2D desk or moves the immersive visitor into the 3D Balcão.

```text
ESTANTE / BUSCA
  │  inspecionar uma fita ou usar "Botar na cesta"
  ▼
CESTA LOCAL (0–15 títulos distintos)
  │  levar ao Balcão para decidir o pacote final
  ▼
BALCÃO — revisar, remover fitas que não vão sair hoje, então "Alugar pacote"
  │
  ├─ sem sessão ─► Seção do membro ─► Clerk ─┐
  ├─ sem perfil ─► escolher nome público ────┤
  └─ membro pronto ──────────────────────────┘
                                              │ retoma a confirmação já iniciada
                                              ▼
PACOTE ATIVO (1 locação, todas as fitas juntas)
  │  mostra sacola + confirmação; ao fechar, volta à página inicial
  ▼
MINHA CONTA mostra as fitas alugadas
  │  "Devolver no Balcão" abre a janela Devoluções no modo 2D ou 3D
  ▼
DEVOLUÇÃO — marcar fitas, escolher assistida / não assistida / não sei, confirmar tudo em um botão
  ▼
HISTÓRICO + LISTA ATUALIZADOS
```

Rules:

- The Cesta never contains more than fifteen distinct titles.
- Shelf/search titles retain a canonical `tmdb:<id>` rental identity; an IMDb ID is carried separately for Stremio, IMDb, and Letterboxd handoffs.
- `Alugar pacote` sends the current temporary Balcão subset in one authenticated request and creates one active rental.
- Removing a tape at the Balcão does not delete it from the local Cesta; abandoning the desk and reopening Cesta restores the full browsing selection.
- Authentication or initial profile setup does not discard the basket; after completion, the pending explicit rental confirmation resumes.
- While a package is active, no second basket/package can be started.
- There is no payment, due date, or playback guarantee in this ritual.

## Spatial composition

The Balcony is a fixed upstairs/mezzanine counter overlooking the main Locadora shelves. The visitor reaches it through a deliberate camera transition, not free-roam movement.

It should look like a real Brazilian video-store counter after dark: practical, a little crowded, warm, and worked-in rather than polished or minimalist. The reference photos establish the direction:

- visibly tall, imperfect piles of VHS cases on the counter;
- dense tape walls and posters behind the desk;
- plain painted/laminate counter surfaces, metal railing, paper notices, and small store clutter;
- an old CRT computer with a small, readable `PESQUISAR TÍTULOS` screen—still a physical counter object, not a dashboard;
- warm fluorescent/amber practical light with restrained blue spill from the shop floor;
- membership paperwork/card cues and a physical return area.

## Required Balcony elements

### 1. Balcão — the pile to rent

This is the primary interactive pile/crate on the counter. It contains every title the visitor is considering for the upcoming rental.

- Add a title from its VHS detail via an explicit `Botar na cesta` action, then use `Levar ao Balcão` to create the temporary counter decision.
- On the Balcony, each tape remains individually inspectable; `Não levar` removes it only from the current counter decision.
- The pile should feel physical: tapes can be stacked, slotted in a crate, or leaned against one another. Its height/density should visibly respond to the number of titles.
- A compact visible count helps the visitor understand their selection without becoming a cart UI.
- It is not a reservation, an inventory lock, a claim of playback, or a payment checkout.

### 2. Rent action

A clear physical desk action—button, stamped receipt control, or counter bell—runs `Alugar`.

For the implemented flow:

- In 3D, `REVISAR CESTA` is a hanging, clickable plaque below the selected tapes; it opens the native decision controls instead of renting immediately. `Alugar pacote` remains the single primary action inside those controls.
- It sends all one-to-three titles together to the authenticated rental endpoint; the database creates one package atomically.
- If identity/profile setup interrupts confirmation, the same basket remains and confirmation resumes after setup.
- The bag occupies the **same exact counter position** previously used by the Balcão pile. It becomes the visible active-rental object: the counter has been cleared because the visitor is taking that rental home.
- Use a slightly translucent white/cream plastic bag with the Locadora mark, handles, believable VHS silhouettes/spines, and the receipt peeking out. It should feel like a real video-store handoff, not a shopping-cart icon.
- Selecting the bag opens the Balcão return controls. The visitor marks one or more tapes, chooses each watched state, and confirms the whole devolução with one button. The current Worker API records one item per request; the client therefore records the batch defensively, removes successful items from retry state, reports partial failure, and always refreshes canonical member state. Returning the last tape removes the bag and leaves the counter ready for a new Cesta.
- `Minha conta` is available in both immersive rooms. Starting a return from the immersive shelf first moves the visitor to the 3D Balcão; starting from normal mode opens the 2D desk.
- The cap is three active titles in one package, enforced in the client, Worker request validation, and database function.
- Do not show money/payment handling. The rental ritual is free and simulated.

### 3. Devoluções — return pile / return chute

Include a clearly separate physical return location: a drop slot, wire basket, or visibly growing `DEVOLUÇÕES` pile.

- Selecting a rented tape opens a tiny return choice: `watched`, `not watched`, or `unknown`.
- Confirming moves that tape out of `rented` state into a local returned/recorded state and creates the satisfying visual of a tape entering the return area.
- The return area should read as operational store texture, not as a warning or late-fee system.
- No playback assumptions: `not watched` is an honest result, not a penalty.

### 4. Membership desk

Include a physical membership cue tied to the real member section:

- the Member Section shows the signed-in username, membership date, active capacity, recent history count, and saved-list count;
- active rentals and progressively loaded history stay private behind the authenticated Worker;
- it is not a public profile or social feature.

### 5. CRT catalogue terminal

The counter includes an old beige/black CRT monitor and keyboard.

- Its screen clearly reads `PESQUISAR TÍTULOS` and opens the separate catalogue-search window.
- The CRT remains a physical, compact prop rather than a second dashboard or canvas-only control surface. Its search action opens the catalogue-search window, not rental confirmation.
- A subtle hover lift plus pointer cursor communicates that it is clickable.

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
