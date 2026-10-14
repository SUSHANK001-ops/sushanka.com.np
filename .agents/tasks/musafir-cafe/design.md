# Musafir Cafe Promise Wall — Technical Design

## Overview

The Promise Wall is a public page at `/musafir-cafe` that renders a warm, late-afternoon cafe wall covered in hundreds of handwritten sticky notes. Anyone can view the wall; signing in (existing Auth.js Google flow) is required only to post. A signed-in visitor opens a three-tab composer (write / draw / photo), the server places the note on a shared coordinate grid using a deterministic overlap-aware algorithm, and the note persists forever (unless the author removes it). Notes live in a **separate MongoDB database** on an independent Mongoose connection, isolated from the main site DB.

The feature is deliberately split into subsystems that are designed here so no architectural decisions are left to implementation: the backdrop layer/z-index stack, the full decorative prop set and repeat strategy, the sticky-note DOM/CSS anatomy, the handwriting-font loading/scoping approach, the horizontal↔vertical layout switch with position recomputation, the `notePlacement` geometry, the separate-DB connection and model binding, the complete REST contract (with `mine` flag and privately-stored `user_id`), the composer's shared state, and the accessibility / reduced-motion / performance strategy.

The design reuses existing precedents verbatim where they exist: `auth.ts` + `lib/userKey.ts` for identity, `lib/cloudinary.ts` + the guestbook upload route for images, `lib/rateLimit.ts` for throttling, `app/(site)/guestbook/ui.tsx` `SignInPopup` for the sign-in gate, and the guestbook route's `sanitize()` + model-guard patterns for data handling.

## Technology stack (locked)

- Next.js 16.1.6 App Router, React 19.2, TypeScript 5.
- Tailwind CSS v4 utilities + a page-scoped stylesheet `app/(site)/musafir-cafe/musafir-cafe.css` for the heavy visual work (textures, gradients, pseudo-elements, keyframes). `<style jsx>` is used only for small per-component animation blocks, mirroring guestbook `ui.tsx`.
- Mongoose for both DB connections. The wall uses a **second** connection via `mongoose.createConnection`.
- Cloudinary v2 (`lib/cloudinary.ts`) for all image storage (drawing PNGs and photos).
- `next/font/google` for handwriting fonts (self-hosted at build — see Font loading; this supersedes the spec's `<link>`/`@import` suggestion for CSP reasons).
- Pointer Events for the drawing canvas. `use-sound` for the paper-rustle, gated by the existing `useSoundFx` mute preference.
- No new runtime dependencies. All of the above are already in `package.json`.

## File inventory

New files (unchanged from the spec's list):

- `app/(site)/musafir-cafe/page.tsx` — server component, metadata, provider detection, renders `MusafirWall`.
- `app/(site)/musafir-cafe/MusafirWall.tsx` — `'use client'` orchestrator: data fetching, layout mode, composer/modal state.
- `app/(site)/musafir-cafe/components/StickyNote.tsx`
- `app/(site)/musafir-cafe/components/WallBackdrop.tsx`
- `app/(site)/musafir-cafe/components/WallProps.tsx`
- `app/(site)/musafir-cafe/components/NoteModal.tsx`
- `app/(site)/musafir-cafe/components/Composer.tsx`
- `app/(site)/musafir-cafe/components/DrawCanvas.tsx`
- `app/(site)/musafir-cafe/components/RulesMailbox.tsx`
- `app/(site)/musafir-cafe/components/LeaveNoteButton.tsx`
- `app/(site)/musafir-cafe/musafir-cafe.css`
- `app/(site)/musafir-cafe/SETUP.md`
- `lib/promiseWallDb.ts`
- `lib/notePlacement.ts`
- `lib/profanity.ts`
- `model/promiseNoteModel.ts`
- `app/api/musafir-cafe/notes/route.ts` (GET list, POST create)
- `app/api/musafir-cafe/notes/[id]/route.ts` (DELETE)
- `app/api/musafir-cafe/notes/[id]/report/route.ts` (POST)
- `app/api/musafir-cafe/upload/route.ts`

Modified files:

- `.env.example` — append a `PROMISE_WALL_DB_URL` section (do not touch existing values).
- `app/(site)/musafir-cafe/fonts.ts` *(new helper, see Font loading)* OR extend root layout — **chosen: new `fonts.ts`**, see below. The root layout fonts are NOT altered.
- `next.config.ts` — **no change needed**: `res.cloudinary.com` is already in both `images.remotePatterns` and the CSP `img-src`. Note images may therefore use either `next/image` or plain `<img>`; this design uses plain `<img>` to match the guestbook (guestbook renders Cloudinary uploads with `<img>` / `no-img-element` eslint-disable), avoiding `next/image` layout constraints inside absolutely-positioned notes.

## Shared type contract

Defined once in `app/(site)/musafir-cafe/types.ts` (new, small — not in the spec's list but needed to keep client/server shapes in sync; implementer may inline into `MusafirWall.tsx` if preferred, but a shared file is cleaner). The **public** note shape (what GET/POST return) is:

```ts
export type NoteFont = 'caveat' | 'kalam' | 'patrick-hand' | 'reenie-beanie'
export type NoteColor = 'yellow' | 'pink' | 'mint' | 'kraft' | 'white' | 'orange' | 'blue'
export type NoteInk = 'blue' | 'black' | 'brown'
export type PinStyle = 'none' | 'pin-red' | 'pin-blue' | 'pin-yellow' | 'tape-h' | 'tape-diag'

export interface PublicNote {
  id: string                 // Mongo _id as string
  display_name: string
  is_anonymous: boolean
  text: string
  font: NoteFont
  color: NoteColor
  ink_color: NoteInk
  drawing_url: string | null
  photo_url: string | null
  photo_caption: string | null
  pos_x: number
  pos_y: number
  rotation: number           // degrees, -6..+6
  z_index: number
  pin_style: PinStyle
  created_at: string         // ISO
  mine: boolean              // derived server-side; NEVER expose user_id
}
```

`user_id` NEVER appears in any response shape. `mine` is the only ownership signal sent to clients.

## Separate DB connection and model binding

### `lib/promiseWallDb.ts`

Modeled on `lib/db.ts` but using `mongoose.createConnection` (a dedicated connection, not the global `mongoose.connect` default connection used by the main site). This keeps the wall's data physically on a separate database/cluster addressed by `PROMISE_WALL_DB_URL`, so the wall can never read or write main-site collections.

```ts
import mongoose, { Connection } from 'mongoose'

const uri = process.env.PROMISE_WALL_DB_URL
// Do NOT throw at module load — the build imports this file. Throw at call time.

interface PromiseWallCache {
  conn: Connection | null
  promise: Promise<Connection> | null
}

// Distinct global key so it never collides with global.mongoose (main DB).
const g = global as unknown as { __promiseWallConn?: PromiseWallCache }
let cached = g.__promiseWallConn
if (!cached) cached = g.__promiseWallConn = { conn: null, promise: null }

export async function getPromiseWallConnection(): Promise<Connection> {
  if (!uri) throw new Error('PROMISE_WALL_DB_URL is not defined')
  if (cached!.conn) return cached!.conn
  if (!cached!.promise) {
    // createConnection returns a Connection; .asPromise() resolves when open.
    cached!.promise = mongoose.createConnection(uri).asPromise()
  }
  cached!.conn = await cached!.promise
  return cached!.conn
}
```

Rationale for `createConnection` over `connect`: `mongoose.connect` mutates the single default connection shared by `lib/db.ts`'s models (Guestbook, RateLimit). Using it for the wall would either hijack or be hijacked by the main connection. `createConnection` yields an isolated connection whose `.model()` registry is independent, which is exactly what binding the note model to a separate DB requires. `.asPromise()` is the documented way to await an initial `createConnection` open.

**Why `uri` is read at module top but only thrown-on at call time:** reading `process.env` at import is harmless; throwing at import would break `next build` (the route modules are evaluated during build). This mirrors the guestbook routes' guard-at-request-time rule in the spec.

### `model/promiseNoteModel.ts`

The model is bound to the separate connection, so it must be created **per request after the connection resolves** (the connection's model registry only exists once open). Pattern:

```ts
import mongoose, { Schema, Model } from 'mongoose'
import { getPromiseWallConnection } from '@/lib/promiseWallDb'

export interface IPromiseNote {
  user_id: string            // PRIVATE — never serialized to clients
  display_name: string
  is_anonymous: boolean
  text: string
  font: string
  color: string
  ink_color: string
  drawing_url?: string | null
  photo_url?: string | null
  photo_caption?: string | null
  pos_x: number
  pos_y: number
  rotation: number
  z_index: number
  pin_style: string
  status: 'visible' | 'hidden' | 'reported'
  report_count: number
  // created_at / updated_at provided by { timestamps: ... } mapped below
}

const PromiseNoteSchema = new Schema<IPromiseNote>(
  {
    user_id: { type: String, required: true, index: true },
    display_name: { type: String, required: true, trim: true, maxlength: 24 },
    is_anonymous: { type: Boolean, default: false },
    text: { type: String, default: '', maxlength: 280 },
    font: { type: String, required: true },
    color: { type: String, required: true },
    ink_color: { type: String, required: true },
    drawing_url: { type: String, default: null },
    photo_url: { type: String, default: null },
    photo_caption: { type: String, default: null, maxlength: 280 },
    pos_x: { type: Number, required: true },
    pos_y: { type: Number, required: true },
    rotation: { type: Number, required: true },
    z_index: { type: Number, required: true },
    pin_style: { type: String, default: 'none' },
    status: { type: String, enum: ['visible', 'hidden', 'reported'], default: 'visible', index: true },
    report_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
)

// Declared indexes ARE the migration — Mongo builds them on connect.
PromiseNoteSchema.index({ created_at: -1 })
PromiseNoteSchema.index({ status: 1 })
PromiseNoteSchema.index({ pos_x: 1, pos_y: 1 })

export async function getPromiseNoteModel(): Promise<Model<IPromiseNote>> {
  const conn = await getPromiseWallConnection()
  return (
    (conn.models.PromiseNote as Model<IPromiseNote>) ||
    conn.model<IPromiseNote>('PromiseNote', PromiseNoteSchema)
  )
}
```

Note the model guard uses `conn.models.PromiseNote` / `conn.model(...)` on the **separate** connection, matching the spec, not the global `mongoose.models`. The `created_at`/`updated_at` timestamp field names match the required schema field list; the index on `created_at` therefore matches the real field.

**"Migration" clarification (for SETUP.md):** the project has no migration-file system. The three `.index()` declarations are the schema's migration — MongoDB builds them automatically when the connection first opens and the collection is touched. Do not invent a migration runner.

## Font loading and scoping

**Decision (supersedes the spec's `<link>`/`@import` suggestion):** load all four handwriting fonts through `next/font/google`, not an external stylesheet link.

Reason, verified against `next.config.ts`: the site CSP sets `style-src 'self' 'unsafe-inline'` and `font-src 'self' data:`. Neither `fonts.googleapis.com` (the stylesheet) nor `fonts.gstatic.com` (the font files) is allowlisted, so a `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` or a CSS `@import url(https://fonts.googleapis.com/...)` would be **blocked by CSP** and the fonts would silently fail. `next/font/google` downloads and self-hosts the font files at build time, serving them from the same origin (`'self'`), which satisfies the existing CSP with no config change. Caveat is already loaded this way in the root layout, proving the approach works here.

Implementation: a new `app/(site)/musafir-cafe/fonts.ts` declares the three missing faces (Caveat is reused from root via its CSS variable, but to keep this page self-contained and avoid depending on root-layout internals we re-declare all four with page-local variables):

```ts
import { Caveat, Kalam, Patrick_Hand, Reenie_Beanie } from 'next/font/google'

export const caveat = Caveat({ subsets: ['latin'], weight: ['400','500','600','700'],
  variable: '--mz-caveat', display: 'swap' })
export const kalam = Kalam({ subsets: ['latin'], weight: ['300','400','700'],
  variable: '--mz-kalam', display: 'swap' })
export const patrickHand = Patrick_Hand({ subsets: ['latin'], weight: ['400'],
  variable: '--mz-patrick', display: 'swap' })
export const reenie = Reenie_Beanie({ subsets: ['latin'], weight: ['400'],
  variable: '--mz-reenie', display: 'swap' })
```

`page.tsx` applies all four `.variable` class names plus the scope class to the page's root wrapper:

```tsx
<div className={`musafir-wall-root ${caveat.variable} ${kalam.variable} ${patrickHand.variable} ${reenie.variable}`}>
```

**Scoping:** every font rule in `musafir-cafe.css` is nested under `.musafir-wall-root` so no global typography leaks to other pages. `display: 'swap'` is set per the spec. CSS maps each note's `font` enum to a utility class:

```css
.musafir-wall-root { font-family: var(--mz-caveat), cursive; }
.musafir-wall-root .mz-font-caveat   { font-family: var(--mz-caveat), cursive; }
.musafir-wall-root .mz-font-kalam    { font-family: var(--mz-kalam), cursive; }
.musafir-wall-root .mz-font-patrick-hand   { font-family: var(--mz-patrick), cursive; }
.musafir-wall-root .mz-font-reenie-beanie  { font-family: var(--mz-reenie), cursive; }
```

Page UI buttons/headings inherit the handwriting font from `.musafir-wall-root`. The `cursive` fallback is always last in each stack.

## Visual / emotional design: backdrop layer stack and z-index scheme

The wall is a single large positioned canvas (`.mz-canvas`) inside a viewport-filling scroll container (`.mz-viewport`). All layers are children of `.mz-canvas` and stretch to its full scrollable size (so the wood, mesh, and light sweep extend across the entire horizontal/vertical wall, not just the visible window). The light-sweep and vignette are `position: sticky`/`fixed`-to-viewport overlays so they track the viewport rather than the canvas — see note below.

Layer stack, bottom to top, with explicit `z-index` bands (gaps left between bands so notes can interleave):

| z-index | Layer | Element | Notes |
|---|---|---|---|
| 0 | Wood wall base | `.mz-wall-wood` | warm wood gradient + faint vertical plank lines (repeating-linear-gradient) |
| 1 | Wire-mesh grid | `.mz-wall-mesh` | dark square-grid via SVG `pattern` data-URI background, repeating; low opacity so wood shows through |
| 2 | Top wooden beam | `.mz-beam` | thick dark rustic beam pinned to top edge of canvas (full width/height on mobile top), heavier drop shadow below it |
| 2 | Floor strip | `.mz-floor` | wooden floor strip pinned to bottom edge |
| 3 | Decorative props (behind notes) | `.mz-props` (`WallProps`) | all SVG/CSS props; see prop set. Repeated at intervals |
| 10–~9000 | Sticky notes | `.mz-note` (`StickyNote`) | per-note `z_index` from DB, offset into this band (`baseZ = 10 + note.z_index`); newer notes slightly higher, capped |
| 9500 | Hover/focus lifted note | `.mz-note.is-lifted` | temporary bump while hovered/focused, below modal |
| 9800 | Sunlight sweep overlay | `.mz-light` | soft golden diagonal gradient + first-load sweep animation; `pointer-events:none`; `mix-blend` kept subtle, opacity ≤ 0.18 so it never hurts readability |
| 9810 | Edge vignette | `.mz-vignette` | radial inset shadow, `pointer-events:none` |
| 10000 | Floating "Leave a promise" button | `LeaveNoteButton` | fixed bottom-right |
| 10050 | Scroll arrows + custom scrollbar | | fixed, desktop only |
| 10100+ | Modals (NoteModal, Composer, RulesMailbox, SignInPopup) | portaled to `document.body` | above everything; matches guestbook modal z (`z-[9999]`), use `z-[10100]`+ to clear the page's own light overlay |

The light sweep and vignette must visually sit above notes but must not block interaction, hence `pointer-events: none`. Because they should cover the *viewport* (not scroll with the giant canvas), they render as `position: fixed` elements inside `.musafir-wall-root` (which establishes a stacking context) rather than as canvas children. The vignette opacity is capped and the golden overlay uses `screen`/soft-light at low opacity so note contrast is preserved — a hard requirement from the spec ("never reduce note readability").

Modals are rendered with `createPortal(..., document.body)` exactly like guestbook `ui.tsx`, so their stacking is independent of the page's light overlay.

## Decorative prop set, placement, and repeat strategy

Props live in `WallProps.tsx`, rendered as a repeating "prop cluster". Each cluster is an absolutely-positioned group at `z-index: 3` (behind notes). A cluster is emitted once per repeat interval:

- **Desktop (horizontal wall):** one cluster roughly every ~2 screen-widths (`clusterSpacingPx = 2 * viewportWidth`, min 1600px). Clusters are placed by index `i` at `left = i * clusterSpacingPx + offset`, spanning the full canvas width.
- **Mobile (vertical wall):** one cluster roughly every ~2 screen-heights, placed down the column.

Each cluster contains the full prop set (SVG/CSS), positioned within the cluster so notes may overlap them slightly but the placement algorithm's "no note fully covered" rule plus deliberate prop sizing keeps props from being fully hidden (props are large relative to a 160px note; notes overlapping ≤35% of each other also tend not to blanket a prop). Prop list:

1. **Two mailbox-style wooden houses with glass fronts** — small SVG houses. **One is the clickable "Read the rules" box** (`RulesMailbox` trigger): it is a real `<button>` with `aria-label="Read the house rules"`, keyboard-focusable, opens the rules popup on click/Enter/Space.
2. **Rustic wooden drawer cabinet** at lower-right of the cluster, with small jars and a **pen cup on top** (the pen cup visually hints at the draw tool).
3. **Hanging string of fairy lights** across the top of the cluster, below the beam — gentle twinkle animation on first load (CSS keyframes staggered per bulb; disabled under reduced motion).
4. **Small potted plant.**
5. **Hanging wooden "Musafir Cafe" sign** — carries the warm generic traveler-cafe tagline (see microcopy).
6. **A few push-pins and washi-tape strips** scattered as decoration (distinct from the pins attached to notes).
7. **Tiny chalkboard** reading "Leave a promise".

Props are decorative; all except the rules mailbox are `aria-hidden="true"` with `pointer-events: none` so they never trap focus or intercept note clicks. The rules mailbox is the single interactive prop.

To keep the DOM light with 1000+ notes, prop clusters are also only mounted when near the viewport (same IntersectionObserver windowing used for notes), since far-off clusters off a 50-screen-wide wall are pure overhead.

## Sticky-note DOM/CSS anatomy

A note is an absolutely-positioned article inside the canvas. DOM (in `StickyNote.tsx`):

```html
<article
  class="mz-note mz-color-yellow mz-font-caveat mz-ink-blue"
  style="left:{pos_x}px; top:{pos_y}px; --rot:{rotation}deg; z-index:{baseZ}"
  tabindex="0" role="button"
  aria-label="Note by {display_name}. Press Enter to read."
>
  <span class="mz-pin mz-pin--red" aria-hidden="true"></span>   <!-- optional, from pin_style -->
  <span class="mz-adhesive" aria-hidden="true"></span>          <!-- lighter strip at top -->
  <!-- photo notes: polaroid photo on top -->
  <img class="mz-note-photo" src="{photo_url}" alt="Photo shared by {display_name}" loading="lazy" />
  <!-- drawing (transparent PNG) -->
  <img class="mz-note-drawing" src="{drawing_url}" alt="Drawing by {display_name}" loading="lazy" />
  <p class="mz-note-text">{text}</p>                            <!-- plain text, never dangerouslySetInnerHTML -->
  <span class="mz-note-mine" aria-hidden="true"></span>         <!-- small pin marker if mine -->
</article>
```

CSS anatomy (all under `.musafir-wall-root`):

- **Base:** `width/height ~160px` desktop, `~130px` mobile (via media query); `transform: rotate(var(--rot))`; `padding` for text; `will-change: transform` only while lifted.
- **Paper color:** `mz-color-*` sets a subtle two-stop gradient (not flat) per color (yellow/pink/mint/kraft/white/orange/blue).
- **Paper texture:** faint noise via a tiny inline SVG `feTurbulence` data-URI background blended at very low opacity, layered under the gradient.
- **Layered shadow:** two shadows — a tight contact shadow (`0 1px 2px rgba(0,0,0,.25)`) plus a soft long shadow (`0 10px 18px rgba(0,0,0,.22)`), giving the "sitting on the wall" look.
- **Curled bottom-right corner:** `::after` pseudo-element with a gradient triangle + its own small shadow to fake the lift.
- **Adhesive strip:** `.mz-adhesive` is a slightly lighter translucent band near the top.
- **Pin / tape:** `pin_style` maps to `.mz-pin--*` (a small round pin SVG, random color) or `.mz-tape-*` (a semi-transparent washi strip). Positioned at the top/corner, never over the text region (text has top padding reserved below the adhesive/pin zone).
- **Ink color:** `mz-ink-*` sets `.mz-note-text` color to dark blue / black / brown.
- **Photo notes:** `.mz-note--photo` makes the note slightly taller (polaroid), photo pinned top with a white border, caption/text below.
- **Hover (desktop) / tap (mobile):** `.is-lifted` translates up 4–6px, rotates toward `0deg` (`--rot: 0deg` transition), raises z-index to the lifted band, deepens the shadow. Disabled under `prefers-reduced-motion`.
- **Focus:** `:focus-visible` draws a visible focus ring (`outline` offset) in addition to any hover lift, for keyboard users.

Interaction: click/tap/Enter/Space opens `NoteModal` (the larger "read" view with full note, full-size drawing/photo, display name, date). The modal lifts the note toward the reader with a soft, mutable paper sound (see sound).

Per-note randomness (color, font, rotation, pin_style) is **decided server-side at creation** and stored, so every visitor sees the identical wall. The client only reads stored values; it does not re-randomize on render.

## Layout: horizontal vs vertical switch and position recomputation

The wall stores canonical positions for the **desktop (horizontal)** orientation in `pos_x`/`pos_y`. The breakpoint is `~1024px` (`matchMedia('(min-width: 1024px)')`).

**Desktop (horizontal):** `.mz-viewport` is `height: 100vh` (minus nav), `overflow-x: auto; overflow-y: hidden`. `.mz-canvas` has an explicit `width` = `wallWidth` (the max `pos_x` + note width + margin, grown by placement) and `height` = viewport height. Wheel/trackpad handling (in `MusafirWall`):

- A `wheel` listener on `.mz-viewport` with `{ passive: false }` converts vertical delta to horizontal: `el.scrollLeft += (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX)` then `e.preventDefault()`. Shift+wheel already produces `deltaX` in most browsers and is passed through.
- **Drag-to-pan:** pointerdown on empty canvas starts a drag (track `scrollLeft` vs pointer X), pointermove pans, pointerup ends. Drags that move < 5px are treated as clicks (so note clicks still work). Drag ignores pointerdown that originates on a `.mz-note` or interactive prop.
- **Custom slim scrollbar** + small left/right arrow buttons that scroll by ~0.8 viewport width with smooth behavior.

**Mobile (vertical):** `.mz-viewport` is `overflow-y: auto; overflow-x: hidden`, `.mz-canvas` is a narrower column with explicit `height` = `wallHeight`. Normal touch scrolling; no wheel hijack, no drag-pan.

**Position recomputation for the active orientation.** `pos_x`/`pos_y` are authored for a wide horizontal wall. On mobile we need a tall narrow column, so positions are **recomputed client-side deterministically** from the stored values — not re-randomized — so the mobile layout is stable across reloads and across users (same inputs → same output). Chosen mapping:

- Sort notes by `created_at` (stable). For mobile, lay them into the narrow column using the **same `notePlacement` geometry** (shared `lib/notePlacement.ts`, see below) run in a pure client pass over the sorted notes with `orientation: 'vertical'` and the mobile column width. Because the algorithm is deterministic given the same ordered input and the per-note stored jitter seed, every client computes identical mobile coordinates.
- To make this reproducible without server round-trips, each note carries its stored `rotation` and a derived seed. The placement function accepts an explicit integer `seed` per note (derived from the note id) so its "random" jitter is a pure function of the seed. This makes both server placement and client mobile re-layout deterministic.

This is the one real subtlety: **`lib/notePlacement.ts` must be seedable and orientation-parameterized** so it serves (a) authoritative server placement for horizontal and (b) deterministic client re-layout for vertical. See the algorithm section for the seed contract.

On orientation change (resize across the breakpoint, or device rotation), `MusafirWall` recomputes the active layout from the stored notes and the current viewport dimension, then updates `wallWidth`/`wallHeight`. Note DOM is keyed by note id so React moves rather than remounts them.

## Note placement algorithm (`lib/notePlacement.ts`)

Pure, dependency-free, deterministic module usable on both server and client. Core signature:

```ts
export interface PlacedNote { pos_x: number; pos_y: number; rotation: number }
export interface ExistingNote { pos_x: number; pos_y: number; w: number; h: number }
export type Orientation = 'horizontal' | 'vertical'

export interface PlaceInput {
  existing: ExistingNote[]      // currently-visible notes with their boxes
  noteW: number; noteH: number  // the new note's size (photo notes taller)
  wall: { width: number; height: number }
  orientation: Orientation
  seed: number                  // derived from note id -> deterministic jitter
}

export interface PlaceResult {
  placement: PlacedNote
  wall: { width: number; height: number }   // possibly grown
}

export function placeNote(input: PlaceInput): PlaceResult
```

A small seeded PRNG (mulberry32 over `seed`) backs every random choice so results are reproducible.

**Geometry (axis-aligned bounding boxes).** Rotation is small (±6°); we treat each note as its axis-aligned box `[x, x+w] × [y, y+h]` for overlap math. This is a deliberate simplification — exact rotated-rectangle overlap is unnecessary for a "feels like a real wall" result and would make the 35%/60% thresholds harder to reason about. Overlap area between two boxes A and B:

```
ox = max(0, min(ax+aw, bx+bw) - max(ax, bx))
oy = max(0, min(ay+ah, by+bh) - max(ay, by))
overlapArea = ox * oy
```

**Algorithm steps (matches the spec exactly):**

1. **Jittered grid of slots.** Divide the wall into a grid of cells sized `~ noteW * 1.1 × noteH * 1.1`. Each cell center is the candidate slot, nudged by a seeded jitter of up to ±(cell/4) so the grid never looks mechanical.
2. **Pick emptiest slot (lowest local density).** For each candidate slot, compute local density = sum of overlap area that a note placed there would have with existing notes within a 1-slot neighborhood (cheap: only test existing notes whose box is within `noteW+cellW` / `noteH+cellH` of the slot). Sort candidate slots ascending by density; iterate from emptiest.
3. **For the chosen slot, add jitter and rotation.** Apply seeded jitter of ~±30px to the slot position and a seeded rotation in `[-6°, +6°]`.
4. **Reject invalid positions.** A candidate position is rejected if **either**:
   - it would cover **more than 35%** of any single existing note's area: `overlapArea / (existing.w * existing.h) > 0.35` for any existing note, **OR**
   - any existing note would end up with **less than 60% of its area visible**. "Visible" is computed against **all notes stacked above it** (notes with higher final z-index), not just the new one, because a real wall hides a note only when newer notes sit on top. For the incoming note (highest z so far) this reduces to: the incoming note must not cover >40% of any lower note. Combined with rule (a)'s 35% cap, the binding constraint per existing note is `overlapArea / existingArea ≤ 0.35`. The 60% rule is retained explicitly as a second guard so that if future notes change z ordering the invariant still holds; the implementation checks both and rejects if either fails.

   Because new notes always get the **highest** z (newest on top), the incoming note is the only thing that can newly hide an existing one, so in practice checking the incoming overlap against each existing note's area with the stricter 35% threshold satisfies both clauses. The code still expresses both clauses for clarity and future-proofing.
5. **Try slots in density order** until one passes. If none passes, **extend the wall**: grow `wall.width` (horizontal) or `wall.height` (vertical) by one screen-dimension, regenerate the new slots in the extended region, and place there. Guaranteed to succeed because the extended empty region has zero-density slots.

**Z-index / newest-on-top.** The route assigns `z_index = (max existing z_index) + 1`, capped at a ceiling (`Z_CAP = 9000`) per the "capped per rules" requirement; once capped, new notes share the ceiling (ties broken by created_at at render, which is fine since they rarely physically overlap after placement). `baseZ` used in the DOM is `10 + min(z_index, Z_CAP)`.

**Determinism contract.** `seed` is derived from the note's Mongo `_id` (e.g. a hash of the hex string) so the server computes placement once and stores `pos_x/pos_y/rotation`, while the client vertical re-layout recomputes `pos_x/pos_y` from the same seed + the vertical wall width and gets a stable column. Rotation is stored and reused verbatim in both orientations.

**Server input set.** On POST, `existing` = all `status: 'visible'` notes' boxes (projection of `pos_x, pos_y` + width/height derived from whether they are photo notes). For a wall of 1000+ notes this is one indexed query; the neighborhood filter in step 2 keeps the per-slot cost near O(local notes), and overall placement is well under a request budget. If this ever becomes slow, a follow-up can cache the box set — noted as a non-blocking optimization, not needed now.

**Unit-testable** in isolation: given a fixed `existing` set, wall size, and seed, `placeNote` returns a fixed result and never violates the 35%/60% rules. This is the main unit-test target (see testability).

## API contract

All routes are App Router handlers, `export const dynamic = 'force-dynamic'`, `NextResponse.json`, `try/catch` with `console.error` + friendly JSON error, `@/` imports — matching the guestbook routes. All DB access guarded at request time via `getPromiseNoteModel()` (never at import).

### `GET /api/musafir-cafe/notes?cursor=&limit=`

Public, no auth required for viewing. Returns visible notes paginated.

- `limit`: default 100, clamp to max 200.
- `cursor`: opaque — the `created_at` ISO (plus `_id` tiebreak) of the last item from the previous page. Query: `{ status: 'visible', created_at: { $lt: cursorDate } }` sorted `created_at: -1`, `.limit(limit+1)` to detect `hasMore`. Using `_id` as a secondary sort/tiebreak avoids skips when timestamps collide.
- Ownership: `const session = await auth(); const viewer = userKey(session)`. For each note, `mine = Boolean(viewer && note.user_id === viewer)`. `user_id` is read from the DB **only** to compute `mine` and is then dropped — the serializer explicitly builds the `PublicNote` shape and never spreads the raw doc.

Response:

```json
{
  "notes": [ /* PublicNote[], user_id omitted, mine included */ ],
  "nextCursor": "2025-01-01T00:00:00.000Z|<id>" | null,
  "hasMore": true
}
```

Errors: DB unreachable → `console.error` + `{ error: "Dusting off the wall is taking a moment. Try again." }` status 500 (friendly, handwriting tone surfaced by the client's error state).

### `POST /api/musafir-cafe/notes`

Auth required. Creates a note.

Request body (JSON): `{ text, font, color, ink_color, display_name, is_anonymous, alias?, drawing_url?, photo_url?, photo_caption?, agree_rules }`.

Validation (all server-side, failures return `400` with a friendly message; the client also validates for UX but the server is authoritative):

| Field | Rule | On failure |
|---|---|---|
| auth | `session?.user` present | 401 "Take a seat first. Sign in to leave your note." |
| `agree_rules` | must be `true` on first post; stored implicitly by having any note / tracked server-side | 400 if not agreed |
| content presence | at least one of `text` / `drawing_url` / `photo_url` non-empty | 400 "Your note is empty." |
| `text` | optional string; `sanitize()` (strip control chars `[\u0000-\u001f\u007f]`, collapse whitespace, trim — reused verbatim from guestbook); length ≤ 280 after sanitize; plain text only | 400 "That note is a little too long (max 280)." |
| `display_name` | required; sanitize; length 2–24 | 400 "A name between 2 and 24 characters, please." |
| `is_anonymous` | boolean. If true, the **public** `display_name` is forced to the alias or "Anonymous Musafir"; the real account name is never stored as public name | — |
| `alias` | optional, used only when anonymous; 2–24 after sanitize | 400 if present and out of range |
| `font` | must be in `NoteFont` enum | 400 "Unknown font." |
| `color` | must be in `NoteColor` enum | 400 |
| `ink_color` | must be in `NoteInk` enum | 400 |
| `drawing_url` / `photo_url` | optional; if present must match `^https://res\.cloudinary\.com/` (our Cloudinary host; the guestbook accepts any `https?://` but this feature tightens it per spec: "must be our Cloudinary https URLs") | 400 "That image didn't come from here." |
| `photo_caption` | optional; sanitize; ≤ 280 | 400 |
| profanity | `isClean(text)` and `isClean(photo_caption)` via `lib/profanity.ts` | 400 "Let's keep it kind." |

Rate limits (reuse `lib/rateLimit.ts`, identifier = `userKey(session)`):

```ts
const uid = userKey(session)
const perMin = await rateLimit('musafir-note-min', uid, 1, 60)
if (!perMin.allowed) return 429 "One note a minute, Musafir. Catch your breath."
const perDay = await rateLimit('musafir-note-day', uid, 20, 86400)
if (!perDay.allowed) return 429 "That's enough notes for today. Come back tomorrow."
```

`rateLimit` is backed by the MAIN DB's RateLimit model and stores only a counter keyed by scope+uid — no wall data — so reusing it across DBs is safe (confirmed: `lib/rateLimit.ts` calls `connectDB()` itself).

**Order of operations** (fail cheap first): auth → body parse → field validation → profanity → rate limit (per-min then per-day) → connect wall DB → load visible note boxes → `placeNote` → assign `z_index` → `create` with private `user_id = uid` → return the created note as `PublicNote` (with `mine: true`, no `user_id`).

Pin style selection: server picks `pin_style` with the seeded PRNG (some notes get a pin/tape, most get none), stored on the doc.

`pos_x/pos_y/rotation/z_index` come from `placeNote` + z assignment and are stored.

Response: `{ note: PublicNote }` (status 200). `mine` is `true`.

### `DELETE /api/musafir-cafe/notes/[id]`

Auth required. Owner-only.

- Load note by id. If not found → 404.
- `if (note.user_id !== userKey(session)) return 403 "You can only take down your own notes."` — ownership checked against the privately stored `user_id`, never anything from the client.
- Delete the document (hard delete — spec says "remove your own"). If the note had a `drawing_url`/`photo_url`, best-effort `cloudinary.uploader.destroy(publicId)` — **but** we store only the URL per spec, not publicId for notes. Decision: also store `drawing_public_id` / `photo_public_id` privately on the doc (not in `PublicNote`) so deletion can clean up Cloudinary, mirroring the guestbook which stores `imagePublicId`. This is a small addition to the schema beyond the spec's listed fields; justified because the spec also says "Store only URL (+ publicId)" in the image-storage section, so publicId storage is explicitly sanctioned. Cloudinary destroy failures are logged and swallowed (the note is already gone; a dangling asset is acceptable).
- Response `{ success: true }`.

### `POST /api/musafir-cafe/notes/[id]/report`

Auth required (prevents anonymous report floods).

- Load note; if not found → 404.
- Atomic `findOneAndUpdate({ _id }, { $inc: { report_count: 1 } }, { new: true })`.
- If `report_count >= 5`, set `status: 'hidden'` (auto-hide). (`'reported'` status exists in the enum for a possible future "flagged, under review" state; auto-hide uses `'hidden'` so the GET filter `status: 'visible'` immediately excludes it.)
- To avoid one user reporting repeatedly, keep a lightweight per-user guard via `rateLimit('musafir-report', uid, 1, 86400 /* per note? */)` — **decision:** scope the limiter key to include the note id (`'musafir-report:'+id` as scope via identifier `${uid}:${id}`) so a user can report a given note once/day. This reuses the existing limiter rather than adding a reporters array to the schema.
- Response `{ success: true }` (never reveal the count — no metrics exposed to clients, consistent with the no-counts tone rule).

### `POST /api/musafir-cafe/upload`

Auth required. Identical to `app/api/guestbook/upload/route.ts` with two differences: folder is `'musafir-cafe'`, and max size is **5MB** for photos (spec) — note drawings are small PNGs well under this. Accepts `image/jpeg|png|webp` (+ `image/png` for drawings). Returns `{ url, publicId }`. The client sends the (already client-compressed) photo and the exported drawing PNG through this one endpoint. A light upload rate limit mirrors guestbook (`rateLimit('musafir-upload', ip, 12, 3600)`).

**`next/image` vs CSP:** confirmed no `next.config.ts` change is required — `res.cloudinary.com` is already allowlisted in `images.remotePatterns` and in the CSP `img-src`. Note images render with plain `<img loading="lazy">` to match the guestbook and to sit cleanly inside absolutely-positioned, rotated note boxes.

## Composer three-tab architecture and shared state

`Composer.tsx` is the paper-styled modal (a big sticky-note / notepad), portaled to `document.body`, focus-trapped, Escape-to-close — reusing the modal conventions from guestbook `ui.tsx`. It owns a single `draft` state object shared across all three tabs plus the common fields, so switching tabs never loses work and the live preview always reflects the whole note:

```ts
interface Draft {
  activeTab: 'write' | 'draw' | 'photo'
  text: string
  font: NoteFont
  color: NoteColor
  ink_color: NoteInk
  drawingDataUrl: string | null   // local PNG data URL before upload
  drawingUrl: string | null       // Cloudinary URL after upload
  photoDataUrl: string | null     // compressed preview before upload
  photoUrl: string | null         // Cloudinary URL after upload
  photoCaption: string
  displayName: string             // defaults to session user name
  isAnonymous: boolean
  alias: string                   // used only when isAnonymous
  agreeRules: boolean
}
```

The three tabs are presentational; they read/write slices of this one `draft` (lifted state in `Composer`). A note can combine text + drawing + photo — all three fields coexist in `draft` and all are sent on submit.

- **WRITE tab:** handwriting-font `<textarea>` (class from `draft.font`), live char counter to 280 (`{n}/280`, turns warm-red past limit, submit disabled). Font picker = 4 buttons (the four handwriting faces, each label rendered in its own face). Paper color picker = swatches for the 7 colors. These set `draft.font` and `draft.color` live; the preview updates instantly. (Color/font here are the *author's* choice for the preview; final stored color/font: per spec notes get a random color per note — **decision:** honor the user's explicit picks when they choose, else the server randomizes. The composer's pickers set explicit values; `color`/`font` are always sent, so the server uses them. The "random per note" wording applies when generating the look; letting the author pick their paper is a better UX and still per-note varied. Flagged below as a spec interpretation.)
- **DRAW tab:** `DrawCanvas.tsx`. A `<canvas>` with `touch-action: none` and Pointer Events (`pointerdown/move/up`, `setPointerCapture`) so finger/stylus/mouse all draw. Tools: pen, marker (wider, semi-transparent), eraser (`globalCompositeOperation = 'destination-out'`), undo/redo (snapshot stack of `ImageData` or saved stroke list — stroke list is lighter and chosen), clear. Palette ~8 inks, 3 brush sizes. Export: `canvas.toBlob('image/png')` on a transparent canvas → object URL for preview (`drawingDataUrl`), uploaded to Cloudinary on submit (or on leaving the tab) → `drawingUrl`. Transparency preserved (PNG, no background fill).
- **PHOTO tab:** file input (jpg/png/webp, max 5MB validated client + server). Client-side compress/resize to ~1200px longest edge via an offscreen `<canvas>` draw-and-`toBlob('image/webp', 0.85)` (prefer WebP for size; falls back to the original type if `toBlob` webp unsupported). Preview polaroid-style. A caption/handwritten text field (`photoCaption`) shown with the photo; on the note the photo appears on top with text/caption below (polaroid layout).

**Common fields** below the tabs: Display name (2–24), "Stay a mystery" checkbox (`isAnonymous`) — when ticked, a field for an optional alias; public name becomes the alias or "Anonymous Musafir". A short rules line + "I agree" tick (persisted to `localStorage` key `musafir-rules-agreed`; also sent as `agree_rules` and enforced server-side on first post).

**Live preview:** a `StickyNote` rendered from the current `draft` (with a placeholder position/rotation), so the author sees exactly how it'll look.

**Submit ("Stick it on the wall"):** disabled until valid (name 2–24, agree ticked, at least one of text/drawing/photo). On submit: upload any pending drawing/photo (if not already uploaded) → POST `/notes` → on success close composer, insert the returned note into the wall state, scroll/pan it into view, play the slap animation + settle, and apply a soft glow (`.mz-note--new`, a timed CSS class removed after a few seconds) so the author can find their note. The slap uses a scale-down bounce keyframe + an optional paper-rustle via `use-sound`; both animation and sound are suppressed under `prefers-reduced-motion` / when sound is muted.

Error on submit → toast with "The paper slipped. Let's try sticking it again." (reuse the guestbook `ToastProvider`/`useToast` from `ui.tsx` — or a local copy; **decision:** import the existing `ToastProvider`, `useToast`, `SignInPopup` from `../guestbook/ui` to avoid duplicating battle-tested components. They are generic and not guestbook-specific.)

## Sound (`use-sound`)

The spec requires reusing `use-sound` (present in `package.json`). Two sounds: a soft paper-lift when opening a note, and a paper-rustle/slap when sticking one. Add small audio assets under `public/sounds/` (e.g. `paper-lift.mp3`, `paper-stick.mp3`). A local `useMusafirSound()` wrapper uses `useSound(src, { soundEnabled })` where `soundEnabled` is gated by **both** the existing global `useSoundFx().enabled` preference (so the site-wide mute applies) and a page-level mute control required by the spec. Under `prefers-reduced-motion`, sound still may play (motion ≠ sound), but the spec couples them for the composer "satisfying slap"; **decision:** respect `prefers-reduced-motion` for the *animation* and the explicit mute control for *sound*, and additionally honor the global sound preference. The page shows its own small mute toggle in a corner, independent of global.

## Error handling (per operation)

| Operation | Failure condition | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| `getPromiseWallConnection` | `PROMISE_WALL_DB_URL` unset | Fatal (config) | throws → route catch → 500 friendly | `console.error` in route |
| wall DB connect | DB unreachable/timeout | Recoverable (user retries) | GET: 500 "Dusting off the wall is taking a moment."; POST: 500 "The paper slipped." | `console.error` |
| GET query | query error | Recoverable | 500 friendly; client shows error state with retry | `console.error` |
| POST validation | any field invalid | Recoverable | 400 with the specific friendly message (table above) | not logged (expected user error) |
| POST profanity | fails filter | Recoverable | 400 "Let's keep it kind." | not logged |
| POST rate limit | over 1/min or 20/day | Recoverable | 429 + `Retry-After` header + friendly message | not logged |
| `placeNote` | cannot place (should never happen — wall grows) | n/a (guaranteed to place) | — | — |
| POST create | mongoose write error | Recoverable | 500 "The paper slipped. Let's try sticking it again." | `console.error` |
| DELETE | not owner | n/a (expected) | 403 "You can only take down your own notes." | not logged |
| DELETE | not found | n/a | 404 | not logged |
| DELETE | Cloudinary destroy fails | Non-fatal | success still returned (note deleted) | `console.error`, swallowed |
| report | not found | n/a | 404 | not logged |
| upload | wrong type / too big | Recoverable | 400 friendly | not logged |
| upload | Cloudinary error | Recoverable | 500 "Failed to upload." | `console.error` |
| client: image compress | canvas/toBlob fails | Recoverable | fall back to uploading original (still size-checked) | `console.error` client |
| client: fetch wall | network error | Recoverable | error state "Couldn't reach the wall. Try again." + retry button | — |

`rateLimit` itself fails **open** (its own try/catch returns `allowed:true` if the limiter DB is down) — this is the existing library behavior and is acceptable (auth still gates posting).

## Validation ownership and invariants

- **Identity / `user_id`:** owned by the API layer. Always derived from `userKey(session)` server-side, never from the client. The private `user_id` is the single source of truth for ownership (DELETE) and the `mine` flag. This invariant lives entirely server-side because clients cannot be trusted.
- **Public anonymity:** owned by the API layer. When `is_anonymous`, the stored `display_name` is the alias/"Anonymous Musafir"; the real name is never stored as the public name and `user_id` is never serialized. Anonymity is "public-only" — moderation still has `user_id`.
- **Text safety:** owned by the API layer (`sanitize()` + length + profanity). The client renders text as a plain `<p>{text}</p>` — never `dangerouslySetInnerHTML` — so even if sanitize were bypassed, no HTML executes. Two layers (sanitize server-side, plain-text render client-side) enforce the "never render HTML" invariant.
- **Image provenance:** owned by the API layer — only `https://res.cloudinary.com/...` URLs accepted, so a client can't point a note at an arbitrary external image.
- **Placement validity (35%/60%):** owned by `lib/notePlacement.ts`, invoked server-side on create. The invariant "no note is ever fully hidden" is enforced at write time; the stored positions are then immutable, so every reader sees a valid wall. The client never recomputes horizontal positions (only the deterministic vertical remap, which uses the same enforced algorithm).
- **Rate limits:** owned by the API layer via the shared limiter.
- **Rules agreement:** client persists the tick in `localStorage` for UX, but the server treats the first post's `agree_rules` as authoritative; the stored agreement is implicit (a user with ≥1 note has agreed).

## Accessibility, reduced-motion, performance

**Accessibility.** Notes are `tabindex="0"` with `role="button"` and a descriptive `aria-label`; Enter/Space open the read modal (keydown handler). `:focus-visible` renders a clear focus ring that survives the hover-lift transform. Images carry meaningful `alt` ("Photo shared by {name}", "Drawing by {name}"). The rules mailbox is a real `<button>`; all other props are `aria-hidden` + `pointer-events:none` so the tab order is only notes + the mailbox + the floating button + controls. Modals (NoteModal, Composer, RulesMailbox) trap focus (focus first element on open, cycle Tab within, restore focus to the trigger on close) and close on Escape — same pattern as guestbook modals, extended with a focus trap. Ink colors are chosen for sufficient contrast against each paper color (dark blue/black/brown on light papers all exceed 4.5:1; the kraft-brown paper pairs only with black/dark-blue ink, not brown — enforced in the server's color/ink pairing or the composer disables low-contrast combos). The sign-in gate reuses `SignInPopup`.

**Reduced motion.** A single `@media (prefers-reduced-motion: reduce)` block under `.musafir-wall-root` disables: the first-load fade/light-sweep, fairy-light twinkle, note hover/tap lift+rotate, the stick slap bounce, and the new-note glow pulse (reduced to a static highlight). Drag-pan and scrolling remain (they are user-driven, not decoration). This mirrors the existing `@media (prefers-reduced-motion: reduce)` blocks in guestbook `ui.tsx`.

**Performance / virtualization.** With 1000+ notes we must not mount 1000 DOM nodes. Strategy:
- Keep all note *data* in memory (lightweight objects), but only render notes whose box intersects (or is near) the viewport. Implementation: an `IntersectionObserver`-based windowing where the canvas is divided into "sector" sentinels, or simpler and more robust for a free-scrolling canvas — a scroll/resize-driven cull that computes the visible rect (`scrollLeft/Top` + viewport size, padded by one screen as an overscan margin) and renders only notes whose stored box intersects it. **Decision:** use the viewport-rect cull (deterministic, works for both orientations and drag-pan) rather than per-note IntersectionObserver (which struggles with a transformed/overflow canvas). Culling is throttled with `requestAnimationFrame`.
- Images: `loading="lazy"` + prefer WebP (photos compressed to WebP client-side). Drawings are small transparent PNGs.
- Only mount prop clusters near the viewport (same cull).
- Avoid layout thrash: notes are positioned with `left/top` + `transform: rotate` and only animate `transform`/`box-shadow` on hover (compositor-friendly); `will-change: transform` applied only while `.is-lifted`.
- Target ~60fps on mid-range phones: the cull caps live DOM to roughly what fits one or two screens regardless of total note count.

Pagination feeds this: GET pulls 100 at a time; `MusafirWall` can load additional pages as the user scrolls toward the far edge (infinite scroll along the wall), so initial paint is bounded.

## Testability

- **`lib/notePlacement.ts`** — pure and deterministic → straightforward **unit tests**: (1) a placement never violates the 35% rule against any existing note; (2) with a dense existing set the wall grows and placement still succeeds; (3) identical `(existing, wall, seed)` inputs yield identical output (determinism, which underpins the mobile remap); (4) rotation always within ±6°. This is the highest-value test target.
- **`lib/profanity.ts`** — pure → unit test clean/dirty strings and leetspeak basics.
- **Validation/sanitize** — the `sanitize()` helper and the enum/length checks are pure functions → unit testable; factor them into small exported helpers in the route module (or a `lib/musafirValidate.ts`) so they can be imported by tests without spinning up the DB.
- **API routes** — **integration** territory (need a Mongo connection). Note: the project currently has **no test runner configured** (no jest/vitest in `package.json`, confirmed). Per the verification guideline, the implementer should add Vitest (the standard lightweight choice for a Next/TS project) to unit-test the pure modules above; routes/DB are verified via `npm run build` + `npm run lint` and a manual smoke test, since there is no existing integration harness and the environment blocks the dev server. **Flagged** as an addition to confirm with the maintainer if adding a dev dependency is unwanted.
- **Client components** — the drawing canvas, drag-pan, and layout switch are inherently integration/manual; keep logic (placement remap, cull math) in pure helpers that can be unit-tested apart from the DOM.

Verification before handoff: `npm run lint` and `npm run build` must pass. Do **not** start `npm run dev` (environment blocks long-running processes).

## Environment and setup deliverable

**`.env.example`** — append a new section (leave all existing values untouched):

```
# ── Musafir Cafe Promise Wall ──────────────────────────────────────────────
# A MongoDB connection string for a SEPARATE database from MONGODB_URI.
# May point at the same cluster but MUST be a distinct database/URL, so the
# wall's data is isolated from the main site. The Mongoose schema's declared
# indexes are built automatically on first connect (no migration files exist).
PROMISE_WALL_DB_URL=
```

**`app/(site)/musafir-cafe/SETUP.md`** — short, listing:
- The new env var `PROMISE_WALL_DB_URL` and what it is (separate DB, isolated from main).
- That the Mongoose schema's declared indexes (`created_at`, `status`, `(pos_x,pos_y)`) ARE the migration — Mongo builds them on first connect; there is no migration-file system.
- That images reuse the existing Cloudinary config (`lib/cloudinary.ts`), folder `musafir-cafe`.
- The three API endpoint groups: `GET/POST /api/musafir-cafe/notes`, `DELETE /api/musafir-cafe/notes/:id`, `POST /api/musafir-cafe/notes/:id/report`, plus `POST /api/musafir-cafe/upload`.

## Edge cases

- **Empty wall:** GET returns `[]` → client shows "The wall is waiting for its first story." centered on the backdrop.
- **Signed-out posting:** "Leave a promise" / tapping compose while signed out → `SignInPopup` with "Take a seat first. Sign in to leave your note.", `callbackUrl: '/musafir-cafe'`.
- **Very long single word in text:** CSS `overflow-wrap: anywhere` on `.mz-note-text` so a 280-char unbroken string doesn't overflow the note.
- **Only-drawing or only-photo note (no text):** allowed; `.mz-note-text` collapses; polaroid/drawing fills the note.
- **Photo + drawing + text together:** note stacks photo (top), drawing, then text; photo notes get the taller box; placement uses the taller height.
- **Rapid double submit:** submit button disabled while in-flight; the 1/min limiter is the server backstop.
- **Note deleted by owner while others view:** others' next GET simply omits it; optimistic client removal for the owner.
- **Reports reaching 5:** note auto-hidden; disappears from subsequent GETs; author's own view also loses it (acceptable — it's hidden pending the owner being able to see it is gone; owner can see it's gone and repost).
- **Wall extremely wide (many notes):** cull + pagination keep DOM and payload bounded.
- **Orientation flip mid-session:** recompute from stored notes; React keys by id so no remount flash.
- **`toBlob` webp unsupported (older Safari):** fall back to `image/jpeg` compression.
- **Cloudinary URL spoofing attempt:** rejected by the `res.cloudinary.com` prefix check.
- **Note placed over a prop:** allowed to overlap slightly; props sized larger than notes and the no-full-cover rule keep props visible.

## Flagged ambiguities and spec interpretations

1. **Font loading method (corrected):** the spec suggests a `<link>` or scoped `@import` for Google Fonts. The site CSP (`font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, no `fonts.googleapis.com`/`fonts.gstatic.com`) would **block** that at runtime. This design uses `next/font/google` (self-hosted, served from `'self'`), which is how Caveat is already loaded and is CSP-safe, while still scoping application to `.musafir-wall-root` and not touching the root layout's fonts. This is a deliberate deviation to make the feature actually work; no CSP change needed.
2. **Author-chosen paper color/font vs "random per note":** the composer lets the author pick font and paper color (better UX, and the preview needs it). The server stores the chosen values. "Random per note" is honored as the default/variety source but author choice wins. If the maintainer wants strictly random colors ignoring author choice, the composer pickers can be dropped and the server randomizes — flagged, low effort either way.
3. **`drawing_public_id` / `photo_public_id` stored privately:** added beyond the spec's listed note fields so DELETE can clean up Cloudinary assets (the spec's image section does say "Store only URL (+ publicId)", so this is sanctioned). Never serialized to clients.
4. **35%/60% overlap rules — AABB simplification:** overlap is computed on axis-aligned boxes (rotation ignored for the math) because rotations are tiny (±6°) and exact rotated-polygon overlap adds complexity without visible benefit. Both the 35% and 60% clauses are implemented; given newest-on-top z-ordering they reduce to the incoming note covering ≤35% of any existing note. If the maintainer wants exact rotated geometry, that's a contained change inside `notePlacement.ts`.
5. **Report de-dup via rate limiter, not a reporters array:** one report per user per note per day via the existing limiter, avoiding a schema array of reporter ids. Simpler; flagged in case per-user report history is wanted for moderation.
6. **`'reported'` status:** present in the enum but auto-hide uses `'hidden'`. `'reported'` is reserved for a future "flagged but still shown / under review" workflow. No behavior depends on it now.
7. **No test runner exists:** adding Vitest for the pure modules is recommended per the verification guideline but introduces a dev dependency; flagged for maintainer approval. Build + lint are the mandatory gates regardless.
8. **Unverified assumption — audio assets:** `use-sound` needs actual sound files under `public/sounds/`. The repo has `public/sounds/click.mp3` (referenced by `SoundProvider`); paper-lift/paper-stick assets must be added. If none are available, the implementer should ship with sound disabled-by-default and the mute control still present (graceful: no file → no sound, no error).
9. **`createConnection` build-time safety:** `lib/promiseWallDb.ts` reads the env at import but only throws at call time, and the connection opens lazily inside handlers — verified against the spec's "guard DB calls at request time" rule and `lib/db.ts`. The build imports route modules without opening the connection, so a missing `PROMISE_WALL_DB_URL` does not break `npm run build` (only runtime requests fail with a friendly 500).
