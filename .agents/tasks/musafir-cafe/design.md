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
- Root layout fonts are **NOT** altered. The handwriting faces are declared in the new `app/(site)/musafir-cafe/fonts.ts` (listed under New files above), not by modifying the root layout — so there is no font-related modification to any existing file (Finding #8).
- `next.config.ts` — **no change needed** (verified against the real file): `res.cloudinary.com` is already in both `images.remotePatterns` and the CSP `img-src`, and the CSP `img-src` additionally allows `data:` and `blob:` — which the composer relies on for local previews (the `drawingDataUrl` is a `data:`/`blob:` object URL and the compressed photo preview is a `blob:`/`data:` URL before upload). So both stored Cloudinary notes and in-composer previews render without any CSP change. **Note-image rendering (corrected precedent):** the guestbook actually renders its *persisted* Cloudinary attachments with `next/image` (`<Image … width={640}>` in `Guestbook.tsx` ~line 1144); plain `<img>` + `// eslint-disable-next-line @next/next/no-img-element` is used there only for pre-upload previews (`imageUrl`, `editImage`) and the `EmojiImg` component — not for stored images. So using plain `<img>` for note images is a **deliberate deviation** from the guestbook's stored-image pattern, not a match. **Decision:** use plain `<img loading="lazy">` for the on-wall notes anyway, because notes are absolutely-positioned and CSS-rotated inside a free-scrolling/transformed canvas where `next/image`'s intrinsic-size/layout machinery fights the geometry, the images are already Cloudinary-compressed (upload route applies `width: 1200, crop: limit`) and lazy-loaded, and the viewport cull keeps the number of mounted `<img>` tags bounded regardless of total notes (so forgoing `next/image`'s auto-optimization is acceptable for the 1000+ target). **Every plain `<img>` in this feature MUST carry `// eslint-disable-next-line @next/next/no-img-element` immediately above it** (the project's eslint config flags `@next/next/no-img-element`, as seen throughout `Guestbook.tsx`); without the directive `npm run lint` / `npm run build` — the mandatory gate — fails.

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
  pos_x: number              // horizontal (desktop) layout, authoritative
  pos_y: number
  pos_x_v: number            // vertical (mobile) layout, authoritative
  pos_y_v: number
  rotation: number           // degrees, -6..+6 (shared across both orientations)
  z_index: number
  pin_style: PinStyle
  created_at: string         // ISO
  mine: boolean              // derived server-side; NEVER expose user_id
}
```

**Both orientations are computed and stored server-side at creation** (`pos_x/pos_y` for horizontal, `pos_x_v/pos_y_v` for vertical). Clients render the stored coordinates for the active orientation and **never recompute positions** — this makes both layouts server-enforced (the 35%/60% invariant holds for each independently) and removes any cross-client determinism concern. See "Layout" and the placement algorithm.

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
  drawing_public_id?: string | null   // PRIVATE — Cloudinary cleanup on DELETE; never serialized
  photo_public_id?: string | null     // PRIVATE — Cloudinary cleanup on DELETE; never serialized
  photo_caption?: string | null
  pos_x: number              // horizontal layout
  pos_y: number
  pos_x_v: number            // vertical (mobile) layout
  pos_y_v: number
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
    drawing_public_id: { type: String, default: null }, // PRIVATE, never serialized
    photo_public_id: { type: String, default: null },   // PRIVATE, never serialized
    photo_caption: { type: String, default: null, maxlength: 280 },
    pos_x: { type: Number, required: true },
    pos_y: { type: Number, required: true },
    pos_x_v: { type: Number, required: true },
    pos_y_v: { type: Number, required: true },
    rotation: { type: Number, required: true, min: -6, max: 6 }, // ±6° enforced structurally (see Finding #9)
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
| 10–9010 | Sticky notes | `.mz-note` (`StickyNote`) | per-note `z_index` from DB, offset into this band as `baseZ = min(10 + note.z_index, 9010)` (ceiling = `10 + Z_CAP` = 9010); newer notes slightly higher, capped. Among notes sharing the capped value, paint order follows the `(z_index, created_at, _id)` comparator (see Z-index section) |
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
  style="left:{pos_x}px; top:{pos_y}px; --rot:{rotation}deg; z-index:{baseZ}"  <!-- baseZ = min(10 + z_index, 9010) -->
  tabindex="0" role="button"
  aria-label="Note by {display_name}. Press Enter to read."
>
  <span class="mz-pin mz-pin--red" aria-hidden="true"></span>   <!-- optional, from pin_style -->
  <span class="mz-adhesive" aria-hidden="true"></span>          <!-- lighter strip at top -->
  <!-- photo notes: polaroid photo on top. NOTE: each plain <img> below is preceded
       in the real JSX by: // eslint-disable-next-line @next/next/no-img-element -->
  <img class="mz-note-photo" src="{photo_url}" alt="Photo shared by {display_name}" loading="lazy" />
  <!-- drawing (transparent PNG) -->
  <img class="mz-note-drawing" src="{drawing_url}" alt="Drawing by {display_name}" loading="lazy" />
  <p class="mz-note-text">{text}</p>                            <!-- plain text, never dangerouslySetInnerHTML -->
  <span class="mz-note-mine" aria-hidden="true"></span>         <!-- small pin marker if mine -->
</article>
```

CSS anatomy (all under `.musafir-wall-root`):

- **Base:** `width: var(--mz-note-w)` / `height: var(--mz-note-h)` where `--mz-note-w`/`--mz-note-h` are set from the `NOTE_W`/`NOTE_H`/`PHOTO_NOTE_H` logical constants in `lib/notePlacement.ts` (photo notes set `--mz-note-h: 210px`), so the rendered box is exactly the logical placement box (Finding #4). Mobile does **not** shrink individual notes; instead the whole `.mz-canvas` is scaled to fit the `V_WALL_WIDTH = 420` logical column, keeping render geometry equal to placement geometry on every device. `transform: rotate(var(--rot))`; `padding` for text; `will-change: transform` only while lifted.
- **Render / paint order:** `MusafirWall` sorts the visible-note array by the `(z_index, created_at, _id)` comparator (ascending) before mapping to `<StickyNote>` elements, so DOM order (later = painted on top) matches the stacking that `placeNote` validated for the 60% rule. CSS `z-index` (`baseZ`) handles the common non-ceiling case; the sorted DOM order resolves ceiling ties identically to placement (Finding #3). React still keys each note by `id` so reordering moves rather than remounts.
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

**Positions for the active orientation are both server-computed and stored — the client never recomputes them (decision: Finding #2, Option A).** A horizontal layout (`pos_x`/`pos_y`) authored for a wide wall cannot simply be remapped to a tall narrow mobile column by a client-side pass, because `placeNote` is **order- and state-dependent**: each placement depends on the full set already placed (step 2 picks the emptiest slot given everything placed so far) and on wall growth (step 5). A client vertical re-layout would therefore need an identical total order, an identical seed wall height, an identical growth rule, **and** the complete note set in hand — none of which a paginating client can guarantee. Two clients that fetched different pages, or seeded a different initial `wallHeight`, would diverge, and the 35%/60% readability invariant would be re-derived on-device (so any client bug would make mobile readability differ from desktop, and "stored positions are immutable, every reader sees a valid wall" would be false for mobile).

**Chosen approach — store both orientations.** On POST, the server runs `placeNote` **twice** against the current visible set: once with `orientation: 'horizontal'` + the horizontal wall dimensions to produce `pos_x/pos_y`, and once with `orientation: 'vertical'` + the fixed vertical column width to produce `pos_x_v/pos_y_v`. Both results are persisted on the document. `rotation` is computed once (from the note's seed) and shared across both orientations. The two passes are independent placements against the same existing set, so each orientation independently satisfies the 35% per-note cap and the 60% cumulative-visibility rule.

- **Vertical wall width is fixed and pagination-independent:** the vertical column uses a constant logical width `V_WALL_WIDTH = 420` CSS px (the mobile canvas is rendered at this logical width and scaled to the device via CSS, so placement is independent of the actual device width). This keeps `pos_x_v` meaningful on every device without a server round-trip per viewport.
- **Vertical wall height** grows via the same step-5 growth rule as horizontal, but along the height axis.
- The client reads `pos_x/pos_y` when `matchMedia('(min-width: 1024px)')` matches and `pos_x_v/pos_y_v` otherwise. **No client-side placement, re-layout, or re-randomization happens for either orientation.**

On orientation change (resize across the breakpoint, or device rotation), `MusafirWall` switches which stored coordinate pair it renders and updates `wallWidth`/`wallHeight` from the max stored coordinate for that orientation; it does not run any placement. Note DOM is keyed by note id so React moves rather than remounts them.

**`lib/notePlacement.ts` is still seedable and orientation-parameterized**, but only so the *server* can run both passes deterministically (`seed` derived from the note's `_id`); it is no longer run on the client. See the algorithm section for the seed contract.

## Note placement algorithm (`lib/notePlacement.ts`)

Pure, dependency-free, deterministic module usable on both server and client (in practice only the server calls it now). Core signature:

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

**Logical placement box — concrete constants (Finding #4).** Placement happens in a single logical coordinate space (CSS px) that is identical for both the stored coordinates and the rendered DOM; the mobile canvas is scaled as a whole via a CSS transform rather than by shrinking individual notes, so one set of logical dimensions serves every device. These constants live in `lib/notePlacement.ts` and are imported by the POST route (to size `placeNote`'s `noteW/noteH` per note) **and** surfaced to the CSS as `--mz-note-w` / `--mz-note-h` custom properties so the render box can never drift from the placement box:

```ts
// lib/notePlacement.ts — the single source of truth for note geometry.
export const NOTE_W = 160          // logical px, all notes
export const NOTE_H = 160          // logical px, text/drawing notes
export const PHOTO_NOTE_H = 210    // logical px, photo (polaroid) notes are taller
export const V_WALL_WIDTH = 420    // logical px, fixed mobile column width (pagination-independent)
// Helper the route uses to pick the box for a given note:
export function noteBox(isPhoto: boolean): { w: number; h: number } {
  return { w: NOTE_W, h: isPhoto ? PHOTO_NOTE_H : NOTE_H }
}
```

The `~160px desktop / ~130px mobile` figures previously cited in the DOM-anatomy section were presentation hints behind a media query, not the placement box; they are superseded by these logical constants. On mobile the whole `.mz-canvas` is scaled (e.g. `transform: scale(V_WALL_WIDTH-relative factor)` or simply rendered at the logical width inside a `420`-wide column that CSS fits to the device), so a note is always `NOTE_W × (NOTE_H | PHOTO_NOTE_H)` in the coordinate space `placeNote` reasoned about. This makes the stored `pos_x/pos_y`(`_v`) and the 35%/60% math reproducible and keeps the rendered geometry identical to the placed geometry.

**Rotation-inflated bounding box (Finding #5).** The overlap math is AABB-based, but it must account for the persisted ±6° `rotation` or an AABB-approved pair can exceed 35% overlap once actually rotated (a ±6° rotation grows a 160px box's axis-aligned envelope by ~10% linearly). So before any overlap/union test, each note's box — both the incoming note and every existing note — is inflated to the axis-aligned bounding box of its *rotated* rectangle, about the box center, using that note's own stored `rotation` θ:

```ts
// inflate (w,h) to the AABB of the rectangle rotated by theta (radians), centered.
export function rotatedAABB(w: number, h: number, deg: number): { w: number; h: number } {
  const t = (Math.abs(deg) * Math.PI) / 180
  return { w: w * Math.cos(t) + h * Math.sin(t), h: w * Math.sin(t) + h * Math.cos(t) }
}
// the inflated box keeps the same center: x' = cx - w'/2, y' = cy - h'/2
```

Both the per-note 35% cap (a) and the 60% union check (b) operate on these inflated boxes, so the stored invariant holds for the rotated geometry the viewer actually sees. (The incoming note's rotation is drawn before the overlap test — see step 3 — so its envelope is known at check time.)

**Geometry (rotation-inflated axis-aligned bounding boxes).** We still do the overlap math on axis-aligned boxes (exact rotated-polygon overlap is unnecessary for a "feels like a real wall" result and would make the thresholds harder to reason about), **but** each note's box is first inflated to the axis-aligned envelope of its rotated rectangle via `rotatedAABB(w, h, rotation)` (defined above), re-centered on the same center. This closes the gap Finding #5 identified: the invariant is enforced on the geometry the viewer actually sees, not on an un-rotated approximation that a ±6° tilt could push past 35%. Everywhere below, `w`/`h` for a note mean its **rotation-inflated** `w'`/`h'`. Overlap area between two (inflated) boxes A and B:

```
ox = max(0, min(ax+aw, bx+bw) - max(ax, bx))
oy = max(0, min(ay+ah, by+bh) - max(ay, by))
overlapArea = ox * oy
```

For the cumulative visibility check (step 4b) the module exposes a pure helper:

```ts
// Returns the fraction (0..1) of A's area covered by the UNION of the given
// higher-z boxes, approximated on a fixed 10x10 grid (1% cells).
// A cell counts as covered if its CENTER lies inside any higher-z box.
export function coveredFraction(
  A: { pos_x: number; pos_y: number; w: number; h: number },
  higherZBoxes: { pos_x: number; pos_y: number; w: number; h: number }[]
): number
// cellW = A.w/10, cellH = A.h/10; cell (i,j) center = (A.pos_x+(i+0.5)*cellW, A.pos_y+(j+0.5)*cellH)
// covered = count of cells whose center is inside >=1 higherZBox; return covered/100.
```

**Algorithm steps (matches the spec exactly):**

1. **Jittered grid of slots.** Divide the wall into a grid of cells sized `~ noteW * 1.1 × noteH * 1.1`. Each cell center is the candidate slot, nudged by a seeded jitter of up to ±(cell/4) so the grid never looks mechanical.
2. **Pick emptiest slot (lowest local density).** For each candidate slot, compute local density = sum of overlap area that a note placed there would have with existing notes within a 1-slot neighborhood (cheap: only test existing notes whose box is within `noteW+cellW` / `noteH+cellH` of the slot). Sort candidate slots ascending by density; iterate from emptiest.
3. **For the chosen slot, add jitter and rotation.** Apply seeded jitter of ~±30px to the slot position and a seeded rotation in `[-6°, +6°]`.
4. **Reject invalid positions.** The 35% per-note cap and the 60% cumulative-visibility rule are **two independent constraints**; neither implies the other. A candidate position is rejected if **either** fails:

   - **(a) Per-note cap:** the incoming note would cover **more than 35%** of any single existing note's area: `overlapArea(incoming, A) / (A.w * A.h) > 0.35` for any existing note A. This is a pairwise check against one note at a time.
   - **(b) Cumulative visibility:** any existing note A would end up with **less than 60% of its area visible**, where "visible" means the fraction of A's area **not** covered by the **union** of all notes that stack *above* A (including the incoming note). Reject if `coveredUnionArea(A) / (A.w * A.h) > 0.40` for any A. "Stacks above" is defined by the **total order** in the next paragraph — not by raw `z_index` — so the set tested here is exactly the set that renders on top of A.

   **Stacking is a strict total order (Finding #3), shared by placement and render.** `z_index` alone is not a total order once it hits the ceiling: `Z_CAP` makes many newest notes share the top value, and if placement compared "strictly greater `z_index`" while the DOM broke ceiling ties by `created_at`, two ceiling-z notes overlapping >40% could pass both insertions (equal z ⇒ "neither above the other") yet one would visually cover the other at render — a <60%-visible note the invariant forbids. To make insert-time (b) and render-time stacking provably identical, both use the **same** comparator:

   > Note X stacks above note Y iff `(X.z_index, X.created_at, X._id) > (Y.z_index, Y.created_at, Y._id)` compared lexicographically (newer `created_at` is higher; `_id` is the final deterministic tiebreak).

   `placeNote`'s "higher-z boxes" for A are exactly the existing notes that stack above A under this comparator, and the DOM applies the same ordering (see Z-index section + Sticky-note render). Because this is a strict total order, no two notes are ever mutually "not above" each other, so the overlap a placement rejects is precisely the overlap the viewer would have seen.

   **Why both are needed (correcting an earlier error).** It is *not* true that the 35% per-note cap implies the 60% rule. The 35% cap bounds coverage by a *single* note; the 60% rule bounds the *union* of coverage by *all* higher-z notes. Several newer notes can each overlap an older note A by ≤35% while together covering well over 40% of A — e.g. three disjoint 20% overlaps cover 60% of A, leaving it only 40% visible, a violation, even though every pairwise check passed. So (b) must be enforced as a genuine cumulative check, not inferred from (a).

   **Deterministic union approximation (no polygon-union library).** Computing an exact union of axis-aligned rectangles is possible but fiddly; instead rasterize each existing note A's box into a fixed **10×10 grid (100 cells = 1% area resolution)**. For the candidate placement, for each existing note A whose box the incoming note (or any already-higher-z note) overlaps: mark every cell of A's grid whose center lies inside any higher-z note's box. The "higher-z note's box" here means any note that stacks above A under the `(z_index, created_at, _id)` comparator, each taken as its rotation-inflated AABB. Reject the candidate if **more than 40 of the 100 cells** are marked for any A (i.e. >40% covered → <60% visible). The grid resolution, cell-center sampling rule, and the strict `> 40` threshold are fixed so the check is fully deterministic (and reproducible across runs for the same inputs). Keep the per-note 35% cap (a) as an independent guard applied in the same pass.

   Because new notes always get the **highest** stacking rank (newest on top under the `(z_index, created_at, _id)` comparator), at *insertion time* the incoming note is the only note above any existing A, so (b)'s union for A at insertion reduces to the incoming note's coverage of A. But the stored invariant must hold cumulatively as the wall fills: each new insertion re-checks (b) for every existing note against the full set of notes that stack above it (under the comparator), so the union coverage of any note is never allowed to exceed 40%. The implementation evaluates (a) and (b) separately and rejects if either fails.
5. **Try slots in density order** until one passes. If none passes, **extend the wall**: grow `wall.width` (horizontal) or `wall.height` (vertical) by one screen-dimension, regenerate the new slots in the extended region, and place there. Guaranteed to succeed because the extended empty region has zero-density slots.

**Z-index / newest-on-top.** The route assigns `z_index = (max existing z_index) + 1`, capped at a ceiling (`Z_CAP = 9000`) per the "capped per rules" requirement; once capped, new notes share the ceiling value. The CSS `z-index` is therefore **not** a total order on its own at the ceiling — but the stacking *decision* (both in `placeNote` step 4b and in the DOM) uses the total-order comparator `(z_index, created_at, _id)` defined in step 4b, so ceiling ties resolve identically in placement and render. The raw CSS `baseZ` applied to the DOM is `min(10 + z_index, 9010)` (see Finding #6); among notes sharing the capped CSS `z-index`, DOM paint order is driven by **sorting the rendered note list by the same `(z_index, created_at, _id)` comparator ascending** so later-in-array = painted-on-top matches "stacks above". This guarantees the viewer's stacking equals the stacking `placeNote` validated. (Ceiling collisions are rare and such notes seldom physically overlap after placement, but the comparator makes the result correct even when they do.)

**Determinism contract.** `seed` is derived from the note's Mongo `_id` (a 32-bit hash of the hex string) so the server's placement is a pure function of `(existing, wall, orientation, seed)`. The server runs `placeNote` **twice per create** — once horizontal, once vertical — against the same visible set and stores both coordinate pairs plus the single shared `rotation`. The client never runs `placeNote`, so cross-client determinism is no longer a correctness dependency; the seed contract exists purely to keep each server computation reproducible and unit-testable.

**Server input set.** On POST, `existing` = all `status: 'visible'` notes' boxes, each carrying its `z_index`, `created_at`, and `_id` so `placeNote` can apply the stacking comparator for check (b). For the horizontal pass the box is `{ pos_x, pos_y, w, h }`; for the vertical pass it is `{ pos_x: pos_x_v, pos_y: pos_y_v, w, h }` (same note, its stored vertical coordinates), with `w/h` the **rotation-inflated** box (`rotatedAABB(NOTE_W, isPhoto ? PHOTO_NOTE_H : NOTE_H, rotation)`). Both projections come from a single indexed query (`select pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at`). For a wall of 1000+ notes this is one query feeding two in-memory placement passes; the neighborhood filter in step 2 keeps per-slot cost near O(local notes), so both passes stay well under a request budget. If this ever becomes slow, a follow-up can cache the box set — noted as a non-blocking optimization, not needed now.

**Unit-testable** in isolation: given a fixed `existing` set, wall size, and seed, `placeNote` returns a fixed result and never violates the 35% per-note cap **or** the 60% cumulative-visibility rule (the latter checked via `coveredFraction` ≤ 0.40 against every note's higher-z set). The cumulative check specifically must be tested with the three-disjoint-20%-overlaps case that defeats a naive per-note-only check. This is the main unit-test target (see testability).

## Profanity filter (`lib/profanity.ts`)

This module is **net-new** (there is no existing profanity library in the repo — the only reused text helper is the guestbook route's local `sanitize()`). Its contract is specified here so it is implementable and testable without further decisions.

```ts
// lib/profanity.ts
// Returns false if the normalized input contains a blocked term as a WHOLE WORD
// (word-boundary match, never a substring) so that innocent words that merely
// contain a blocked substring are not flagged (classic "Scunthorpe" problem).
export function isClean(input: string | null | undefined): boolean
```

Contract:

1. **Return / empty handling.** `null`, `undefined`, or empty/whitespace-only input → `true` (clean). Returns `false` only when a blocked whole word is detected.
2. **Normalization** (applied before matching, in order): lowercase → strip diacritics (`String.prototype.normalize('NFKD')` then remove combining marks `/[\u0300-\u036f]/g`) → collapse common leetspeak substitutions on the whole string: `@→a`, `0→o`, `1→i` (also treat `l` as a vowel-ish for `1`/`l` ambiguity is **not** done — keep it simple: `1→i`), `3→e`, `$→s`, `5→s`, `7→t`, `4→a`. Then collapse runs of the same character longer than 2 to 2 (`fuuuuck → fuuck`) so padded spellings normalize.
3. **Tokenization & matching.** Split the normalized string on non-letter boundaries (`/[^a-z]+/`) into tokens; the input is dirty if **any token exactly equals** an entry in the blocked list. This is whole-word matching, so `assassin`, `scunthorpe`, `class` etc. are not flagged.
4. **Word list.** A short, curated in-repo constant array (`const BLOCKED: string[]`) maintained in this file — not an external dependency and not a huge dump. Seed it with a small set of unambiguous slurs and the handful of common profanities the maintainer wants excluded; it is deliberately conservative (false negatives preferred over false positives, since posting is already auth-gated and reportable). The list is the single source of truth and is easy to extend.
5. **Call sites.** `isClean` is called on **`text`** and **`photo_caption`**, each **after** `sanitize()` has run, in the POST handler. Either failing → `400 "Let's keep it kind."`.

Because the function is pure and deterministic it is a direct unit-test target (clean strings, dirty whole words, Scunthorpe-type non-matches, and leetspeak/diacritic normalization cases).

## API contract

All routes are App Router handlers, `export const dynamic = 'force-dynamic'`, `NextResponse.json`, `try/catch` with `console.error` + friendly JSON error, `@/` imports — matching the guestbook routes. All DB access guarded at request time via `getPromiseNoteModel()` (never at import).

### `GET /api/musafir-cafe/notes?cursor=&limit=`

Public, no auth required for viewing. Returns visible notes paginated.

- `limit`: default 100, clamp to max 200.
- `cursor`: opaque composite string **`<created_at ISO>|<_id hex>`** of the last item from the previous page (absent/empty on the first page). It is **parsed into `{ ts, id }`** and the query uses **both halves** as a true keyset so no notes are skipped or duplicated when timestamps collide:

```ts
// descending keyset pagination on (created_at, _id)
const sort = { created_at: -1 as const, _id: -1 as const }
const base = { status: 'visible' as const }
const filter = cursor
  ? { ...base, $or: [
      { created_at: { $lt: ts } },
      { created_at: ts, _id: { $lt: id } },   // same timestamp -> break by _id
    ] }
  : base
const docs = await Model.find(filter).sort(sort).limit(limit + 1)...   // +1 to detect hasMore
```

  The sort key `{ created_at: -1, _id: -1 }` is covered by (or compatible with) the declared `created_at: -1` index; `_id` is always indexed. `nextCursor` for the response is built symmetrically from the **last returned (non-overflow) doc**: `` `${last.created_at.toISOString()}|${String(last._id)}` ``, and parsed the same way on the next request (`const [tsStr, id] = cursor.split('|'); const ts = new Date(tsStr)`). A malformed cursor (bad date / missing half) is treated as "first page" (ignored), never a 500. The format and the parse live in one small helper so they can't drift.
- Ownership: `const session = await auth(); const viewer = userKey(session)`. For each note, `mine = Boolean(viewer && note.user_id === viewer)`. `user_id` is read from the DB **only** to compute `mine` and is then dropped — the serializer explicitly builds the `PublicNote` shape and never spreads the raw doc.

Response:

```json
{
  "notes": [ /* PublicNote[], user_id omitted, mine included */ ],
  "nextCursor": "2025-01-01T00:00:00.000Z|652f1a9c3b4d5e6f7a8b9c0d" | null,
  "hasMore": true
}
```

`nextCursor` is `null` when `hasMore` is false (the `limit+1` probe returned no extra row).

Errors: DB unreachable → `console.error` + `{ error: "Dusting off the wall is taking a moment. Try again." }` status 500 (friendly, handwriting tone surfaced by the client's error state).

### `POST /api/musafir-cafe/notes`

Auth required. Creates a note.

Request body (JSON): `{ text, font, color, ink_color, display_name, is_anonymous, alias?, drawing_url?, drawing_public_id?, photo_url?, photo_public_id?, photo_caption?, agree_rules }`. The `*_public_id` values are the `publicId` returned by `POST /api/musafir-cafe/upload`; the server stores them privately for later Cloudinary cleanup and never echoes them back. If a `*_url` is present its matching `*_public_id` should accompany it; a missing public id is tolerated (deletion simply can't clean that asset) but the server validates that any provided public id is a plain string ≤ 256 chars.

Validation (all server-side, failures return `400` with a friendly message; the client also validates for UX but the server is authoritative):

| Field | Rule | On failure |
|---|---|---|
| auth | `session?.user` present | 401 "Take a seat first. Sign in to leave your note." |
| `agree_rules` | must be `=== true` on **every** POST (no agreement record is stored; the client just persists the tick in `localStorage` so the UX only shows it once) | 400 "Please agree to the house rules first." |
| content presence | at least one of `text` / `drawing_url` / `photo_url` non-empty | 400 "Your note is empty." |
| `text` | optional string; `sanitize()` (strip control chars `[\u0000-\u001f\u007f]`, collapse whitespace, trim — reused verbatim from guestbook); length ≤ 280 after sanitize; plain text only | 400 "That note is a little too long (max 280)." |
| `display_name` | required; sanitize; length 2–24 | 400 "A name between 2 and 24 characters, please." |
| `is_anonymous` | boolean. If true, the **public** `display_name` is forced to the alias or "Anonymous Musafir"; the real account name is never stored as public name | — |
| `alias` | optional, used only when anonymous; 2–24 after sanitize | 400 if present and out of range |
| `font` | must be in `NoteFont` enum | 400 "Unknown font." |
| `color` | must be in `NoteColor` enum | 400 |
| `ink_color` | must be in `NoteInk` enum | 400 |
| `drawing_url` / `photo_url` | optional; if present must match `^https://res\.cloudinary\.com/` (our Cloudinary host; the guestbook accepts any `https?://` but this feature tightens it per spec: "must be our Cloudinary https URLs"). **Decision (Finding #8):** we intentionally do **not** pin the cloud-name or `/musafir-cafe/` folder segment in the regex — the authoritative provenance is that the matching `*_public_id` is server-stored from our own upload route's response, not trusted from the URL, so a stricter `^https://res\.cloudinary\.com/${CLOUDINARY_CLOUD_NAME}/image/upload/` adds little and couples the check to an env value. The host-prefix check is sufficient. | 400 "That image didn't come from here." |
| `photo_caption` | optional; sanitize; ≤ 280 | 400 |
| ink/paper pair | `INK_FOR_COLOR[color]` must include `ink_color` (contrast allow-map, below) | 400 "That ink is hard to read on that paper." |
| profanity | `isClean(text)` and `isClean(photo_caption)` via `lib/profanity.ts` | 400 "Let's keep it kind." |

Rate limits (reuse `lib/rateLimit.ts`, identifier = `userKey(session)`):

```ts
const uid = userKey(session)            // string | undefined (email lowercased, else id)
if (!uid) return 401 "Take a seat first. Sign in to leave your note."
const perMin = await rateLimit('musafir-note-min', uid, 1, 60)
if (!perMin.allowed) return 429 "One note a minute, Musafir. Catch your breath."
const perDay = await rateLimit('musafir-note-day', uid, 20, 86400)
if (!perDay.allowed) return 429 "That's enough notes for today. Come back tomorrow."
```

`userKey` (verified in `lib/userKey.ts`) returns `string | undefined` — the lowercased email when present, else the lowercased session id, else `undefined`. Because `user_id` is the single ownership key (used by DELETE and the `mine` flag) and the rate-limit identifier, a note must never be stored with an undefined owner. So after the `session?.user` auth check the route **also** guards `if (!uid)` and returns 401 before any rate-limit or create call. This makes `user_id` a guaranteed non-empty string on every stored note, satisfying the schema's `required: true` and the ownership invariant.

`rateLimit` is backed by the MAIN DB's RateLimit model and stores only a counter keyed by scope+uid — no wall data — so reusing it across DBs is safe (confirmed: `lib/rateLimit.ts` calls `connectDB()` itself).

**Order of operations** (fail cheap first): auth → body parse → field validation (incl. ink/paper pairing, below) → profanity → rate limit (per-min then per-day) → connect wall DB → load visible note boxes (`pos_x pos_y pos_x_v pos_y_v photo_url z_index`) → assign `z_index` → compute `seed` from the pre-generated `_id` (`new mongoose.Types.ObjectId()`, so the seed is known before insert) → run `placeNote` **twice**: horizontal (→ `pos_x/pos_y`) and vertical (→ `pos_x_v/pos_y_v`), sharing one `rotation` → `create` with that explicit `_id` and private `user_id = uid` → return the created note as `PublicNote` (with `mine: true`, no `user_id`).

(Generating the `_id` up front — `const _id = new mongoose.Types.ObjectId()` on the wall connection's types — lets the seed be derived before the document is written, so placement is a pure function of the final id and both passes are reproducible.)

**Optional honeypot (precedent available).** The guestbook POST (`app/api/guestbook/route.ts`) carries a hidden `website` honeypot field and silently returns `{ success: true }` when it is filled, so bots never learn they were caught. Posting here is already auth-gated and rate-limited, so a honeypot is not required; it is noted as an available, low-cost precedent the implementer may mirror (a hidden `website` field in the composer + a `body.website` check that short-circuits to a fake success) if bot pressure appears. Not part of the required contract.

Pin style selection: server picks `pin_style` with the seeded PRNG (some notes get a pin/tape, most get none), stored on the doc.

`pos_x/pos_y/rotation/z_index` come from `placeNote` + z assignment and are stored.

Response: `{ note: PublicNote }` (status 200). `mine` is `true`.

### `DELETE /api/musafir-cafe/notes/[id]`

Auth required. Owner-only.

- `const session = await auth(); if (!session?.user) return 401 "Take a seat first."`
- `const uid = userKey(session); if (!uid) return 401 "Take a seat first."` — `userKey` can return `undefined` (session present but no email **and** no id). Guarding here mirrors the POST handler and prevents the ownership comparison below from running against an `undefined` value (which could otherwise match a note whose `user_id` was somehow also absent). This repeats the POST route's guard rather than relying on the auth check alone (Finding #2).
- Load note by id. If not found → 404.
- `if (note.user_id !== uid) return 403 "You can only take down your own notes."` — ownership checked against the privately stored `user_id` using the **guarded** `uid` (guaranteed non-empty string by the step above), never anything from the client.
- Delete the document (hard delete — spec says "remove your own"). For each of the note's stored `drawing_public_id` / `photo_public_id` that is non-null, call best-effort `await cloudinary.uploader.destroy(publicId)` (same default-exported client as the guestbook). These two private fields are populated on POST from the `publicId` the upload route returns (the POST stores both the `*_url` and the matching `*_public_id`), mirroring the guestbook which stores `imagePublicId`. This is a small addition to the schema beyond the spec's listed note fields; justified because the spec's image-storage section says "Store only URL (+ publicId)", so publicId storage is explicitly sanctioned. The fields are never serialized into `PublicNote`. Cloudinary destroy failures are caught, logged with `console.error`, and swallowed (the note is already gone; a dangling asset is acceptable).
- Response `{ success: true }`.

### `POST /api/musafir-cafe/notes/[id]/report`

Auth required (prevents anonymous report floods).

**Order of operations (dedup limiter BEFORE the increment — Finding #1).** The per-user/per-note dedup only works if it short-circuits *before* the atomic `$inc`; consulting it after the increment (as an earlier draft did) still lets a single user drive `report_count` up on every call, because the limiter would only suppress the response text, not the write. So the limiter is the first gate after auth:

```ts
const session = await auth()
if (!session?.user) return 401 "Take a seat first."
const uid = userKey(session)
if (!uid) return 401 "Take a seat first."   // Finding #2: userKey can be undefined;
                                            // without this the key collapses to
                                            // musafir-report:undefined:<id>, merging all
                                            // such users into one bucket.
const rl = await rateLimit('musafir-report', `${uid}:${id}`, 1, 86400)
if (!rl.allowed) return NextResponse.json({ success: true })  // already reported today;
                                                              // NO re-increment, and we don't
                                                              // reveal the de-dup to the client.
const note = await Model.findById(id)
if (!note) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
const updated = await Model.findOneAndUpdate(
  { _id: id }, { $inc: { report_count: 1 } }, { new: true }
)
if (updated && updated.report_count >= 5 && updated.status === 'visible') {
  updated.status = 'hidden'   // auto-hide; GET filter status:'visible' then excludes it
  await updated.save()
}
return NextResponse.json({ success: true })
```

- The limiter key is composed exactly once as `` `${scope}:${identifier}` `` → `musafir-report:<uid>:<id>` (recall `rateLimit` itself prefixes with the scope; verified in `lib/rateLimit.ts`), allowing a given user to report a given note once per day without adding a reporters array to the schema.
- `'reported'` status exists in the enum for a possible future "flagged, under review" state; auto-hide uses `'hidden'` so the GET filter `status: 'visible'` immediately excludes it.
- **Limiter-down caveat:** `rateLimit` fails **open** (verified — returns `allowed: true` on datastore error), so if the limiter DB is unreachable a user could double-count a report. This is acceptable (reporting is a soft moderation signal and still auth-gated); the ordering must nonetheless stay limiter-before-increment so the common path dedups at all.
- Response `{ success: true }` (never reveal the count — no metrics exposed to clients, consistent with the no-counts tone rule).

### `POST /api/musafir-cafe/upload`

Auth required. Identical to `app/api/guestbook/upload/route.ts` with two differences: folder is `'musafir-cafe'`, and max size is **5MB** for photos (spec) — note drawings are small PNGs well under this. Accept list (stated once): `['image/jpeg', 'image/png', 'image/webp']` — drawings are exported as PNG, photos are WebP/JPEG/PNG, so a single list covers both tabs (no separate drawing exception). Returns `{ url, publicId }`. The client sends the (already client-compressed) photo and the exported drawing PNG through this one endpoint. A light upload rate limit mirrors guestbook (`rateLimit('musafir-upload', ip, 12, 3600)`).

**`next/image` vs CSP:** confirmed no `next.config.ts` change is required — `res.cloudinary.com` is already allowlisted in `images.remotePatterns` and in the CSP `img-src`. Note images render with plain `<img loading="lazy">` as a deliberate deviation from the guestbook's `next/image` usage for stored images (rationale and the mandatory `// eslint-disable-next-line @next/next/no-img-element` directive are in the File inventory → `next.config.ts` note).

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

**Common fields** below the tabs: Display name (2–24), "Stay a mystery" checkbox (`isAnonymous`) — when ticked, a field for an optional alias; public name becomes the alias or "Anonymous Musafir". A short rules line + "I agree" tick (persisted to `localStorage` key `musafir-rules-agreed` so the UI only shows it once; `agree_rules: true` is nonetheless sent on **every** submit and the server requires it on every create).

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
- **Placement validity (35%/60%):** owned by `lib/notePlacement.ts`, invoked server-side on create for **both** orientations. The 35% per-note cap and the 60% cumulative-visibility rule are enforced independently at write time for the horizontal (`pos_x/pos_y`) and vertical (`pos_x_v/pos_y_v`) layouts, **computed on each note's rotation-inflated bounding box** (`rotatedAABB`, Finding #5) so the enforced invariant matches the rotated geometry the viewer sees — not an un-rotated approximation. The cumulative check uses the `(z_index, created_at, _id)` total-order comparator for "stacks above" (Finding #3), which the DOM render order mirrors exactly, so insert-time validation and render-time stacking cannot diverge. Stored positions are then immutable, so **every reader on every device sees a valid, server-enforced wall** (valid in the precise sense: on the rotation-inflated AABB with the shared stacking order; this is now a consistent claim, not an overstatement). The client never computes or recomputes positions for either orientation.
- **Rate limits:** owned by the API layer via the shared limiter.
- **Rules agreement:** owned by the API layer as a **per-request** rule — the server requires `agree_rules === true` on **every** create and rejects any body lacking it (400). It stores **no** separate agreement record and does **not** count a user's existing notes (which would be a race and an extra query). The client persists the tick in `localStorage` (`musafir-rules-agreed`) purely so the composer only surfaces the checkbox once; that persisted value is a UX convenience, not the enforcement point.

## Accessibility, reduced-motion, performance

**Accessibility.** Notes are `tabindex="0"` with `role="button"` and a descriptive `aria-label`; Enter/Space open the read modal (keydown handler). `:focus-visible` renders a clear focus ring that survives the hover-lift transform. Images carry meaningful `alt` ("Photo shared by {name}", "Drawing by {name}"). The rules mailbox is a real `<button>`; all other props are `aria-hidden` + `pointer-events:none` so the tab order is only notes + the mailbox + the floating button + controls. Modals (NoteModal, Composer, RulesMailbox) trap focus (focus first element on open, cycle Tab within, restore focus to the trigger on close) and close on Escape — same pattern as guestbook modals, extended with a focus trap. Ink/paper contrast is a **hard requirement enforced server-side** via an explicit allow-map; the composer mirrors the same map for UX (disabling ink swatches that aren't allowed for the chosen paper), but the server is authoritative because `color` and `ink_color` arrive as independent fields and a client could post any pair:

```ts
// shared constant (types.ts); imported by the POST handler AND the composer
export const INK_FOR_COLOR: Record<NoteColor, NoteInk[]> = {
  yellow: ['blue', 'black', 'brown'],
  pink:   ['blue', 'black', 'brown'],
  mint:   ['blue', 'black', 'brown'],
  white:  ['blue', 'black', 'brown'],
  orange: ['blue', 'black', 'brown'],
  blue:   ['black', 'brown'],         // blue ink on blue paper is too low-contrast
  kraft:  ['black', 'blue'],          // brown ink on kraft-brown paper fails contrast
}
// POST: if (!INK_FOR_COLOR[color].includes(ink_color)) -> 400
//       "That ink is hard to read on that paper."
```

Every allowed pair clears WCAG AA (≥ 4.5:1) for the note text; the two excluded pairs (blue-on-blue, brown-on-kraft) are the only low-contrast combinations and are rejected. The composer renders ink swatches from `INK_FOR_COLOR[draft.color]` and resets `ink_color` to the first allowed ink whenever the paper color changes, so the UI can never present an invalid pair. The sign-in gate reuses `SignInPopup`.

**Reduced motion.** A single `@media (prefers-reduced-motion: reduce)` block under `.musafir-wall-root` disables: the first-load fade/light-sweep, fairy-light twinkle, note hover/tap lift+rotate, the stick slap bounce, and the new-note glow pulse (reduced to a static highlight). Drag-pan and scrolling remain (they are user-driven, not decoration). This mirrors the existing `@media (prefers-reduced-motion: reduce)` blocks in guestbook `ui.tsx`.

**Performance / virtualization.** With 1000+ notes we must not mount 1000 DOM nodes. Strategy:
- Keep all note *data* in memory (lightweight objects), but only render notes whose box intersects (or is near) the viewport. Implementation: an `IntersectionObserver`-based windowing where the canvas is divided into "sector" sentinels, or simpler and more robust for a free-scrolling canvas — a scroll/resize-driven cull that computes the visible rect (`scrollLeft/Top` + viewport size, padded by one screen as an overscan margin) and renders only notes whose stored box intersects it. **Decision:** use the viewport-rect cull (deterministic, works for both orientations and drag-pan) rather than per-note IntersectionObserver (which struggles with a transformed/overflow canvas). Culling is throttled with `requestAnimationFrame`.
- Images: `loading="lazy"` + prefer WebP (photos compressed to WebP client-side). Drawings are small transparent PNGs.
- Only mount prop clusters near the viewport (same cull).
- Avoid layout thrash: notes are positioned with `left/top` + `transform: rotate` and only animate `transform`/`box-shadow` on hover (compositor-friendly); `will-change: transform` applied only while `.is-lifted`.
- Target ~60fps on mid-range phones: the cull caps live DOM to roughly what fits one or two screens regardless of total note count.

Pagination feeds this: GET pulls 100 at a time; `MusafirWall` can load additional pages as the user scrolls toward the far edge (infinite scroll along the wall), so initial paint is bounded.

## Testability

- **`lib/notePlacement.ts`** — pure and deterministic → straightforward **unit tests**: (1) a placement never violates the 35% per-note cap against any existing note (checked on rotation-inflated boxes); (2) a placement never violates the 60% cumulative-visibility rule — include the three-disjoint-20%-overlaps case that passes every pairwise 35% check yet must be rejected by the union check (`coveredFraction` > 0.40); (3) `coveredFraction` returns the expected fraction for hand-worked box arrangements on the 10×10 grid; (4) with a dense existing set the wall grows and placement still succeeds; (5) identical `(existing, wall, orientation, seed)` inputs yield identical output (determinism, which underpins reproducible server placement for both orientations); (6) rotation always within ±6°; (7) the horizontal and vertical passes for the same note produce independent valid layouts; (8) `rotatedAABB` produces the expected inflated dimensions for known angles (e.g. 0° is identity, 6° grows ~10%); (9) the `(z_index, created_at, _id)` stacking comparator is a strict total order (no ties) and the ceiling case — two notes sharing `Z_CAP` that overlap >40% — is rejected rather than mutually ignored (the Finding #3 regression). This is the highest-value test target.
- **`lib/profanity.ts`** — pure → unit test clean strings, dirty whole words, Scunthorpe-type non-matches (blocked substring inside an innocent word is NOT flagged), and leetspeak/diacritic normalization; `null`/empty → clean.
- **Validation/sanitize** — the `sanitize()` helper and the enum/length checks are pure functions → unit testable; factor them into small exported helpers in the route module (or a `lib/musafirValidate.ts`) so they can be imported by tests without spinning up the DB.
- **API routes** — **integration** territory (need a Mongo connection). Note: the project currently has **no test runner configured** (no jest/vitest in `package.json`, confirmed). Per the verification guideline, the implementer should add Vitest (the standard lightweight choice for a Next/TS project) to unit-test the pure modules above; routes/DB are verified via `npm run build` + `npm run lint` and a manual smoke test, since there is no existing integration harness and the environment blocks the dev server. **Flagged** as an addition to confirm with the maintainer if adding a dev dependency is unwanted.
- **Client components** — the drawing canvas, drag-pan, and orientation switch are inherently integration/manual; keep logic (the viewport-cull visible-rect math, the drag-vs-click threshold) in pure helpers that can be unit-tested apart from the DOM. (The client no longer runs placement, so there is no client remap to test.)

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
- **Signed-out posting:** "Leave a promise" / tapping compose while signed out → render the imported `SignInPopup` with `action="leave your note"` (the component composes its own body copy as "Please sign in to {action}..."; it does not accept a free-form message prop). Pass `open`, `onClose`, and an `onSignIn={(provider) => signIn(provider, { callbackUrl: '/musafir-cafe' })}` handler, mirroring the guestbook's usage. The "Take a seat first. Sign in to leave your note." line is the API-layer 401 message, surfaced by the client as a toast if a post is attempted without a session; it is distinct from the popup copy.
- **Very long single word in text:** CSS `overflow-wrap: anywhere` on `.mz-note-text` so a 280-char unbroken string doesn't overflow the note.
- **Only-drawing or only-photo note (no text):** allowed; `.mz-note-text` collapses; polaroid/drawing fills the note.
- **Photo + drawing + text together:** note stacks photo (top), drawing, then text; photo notes get the taller box; placement uses the taller height.
- **Rapid double submit:** submit button disabled while in-flight; the 1/min limiter is the server backstop.
- **Note deleted by owner while others view:** others' next GET simply omits it; optimistic client removal for the owner.
- **Reports reaching 5:** note auto-hidden; disappears from subsequent GETs; author's own view also loses it (acceptable — it's hidden pending the owner being able to see it is gone; owner can see it's gone and repost).
- **Wall extremely wide (many notes):** cull + pagination keep DOM and payload bounded.
- **Orientation flip mid-session:** switch to the other stored coordinate pair (`pos_x/pos_y` ↔ `pos_x_v/pos_y_v`); no client-side placement runs. React keys by id so no remount flash.
- **`toBlob` webp unsupported (older Safari):** fall back to `image/jpeg` compression.
- **Cloudinary URL spoofing attempt:** rejected by the `res.cloudinary.com` prefix check.
- **Note placed over a prop:** allowed to overlap slightly; props sized larger than notes and the no-full-cover rule keep props visible.

## Flagged ambiguities and spec interpretations

1. **Font loading method (corrected):** the spec suggests a `<link>` or scoped `@import` for Google Fonts. The site CSP (`font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, no `fonts.googleapis.com`/`fonts.gstatic.com`) would **block** that at runtime. This design uses `next/font/google` (self-hosted, served from `'self'`), which is how Caveat is already loaded and is CSP-safe, while still scoping application to `.musafir-wall-root` and not touching the root layout's fonts. This is a deliberate deviation to make the feature actually work; no CSP change needed.
2. **Author-chosen paper color/font vs "random per note":** the composer lets the author pick font and paper color (better UX, and the preview needs it). The server stores the chosen values. "Random per note" is honored as the default/variety source but author choice wins. If the maintainer wants strictly random colors ignoring author choice, the composer pickers can be dropped and the server randomizes — flagged, low effort either way.
3. **`drawing_public_id` / `photo_public_id` stored privately:** added beyond the spec's listed note fields so DELETE can clean up Cloudinary assets (the spec's image section does say "Store only URL (+ publicId)", so this is sanctioned). Never serialized to clients.
4. **35%/60% overlap rules — rotation-inflated AABB (resolved, not merely flagged):** overlap is computed on axis-aligned boxes, but each box is first inflated to the AABB of its rotated rectangle (`rotatedAABB(w, h, rotation)`) using the note's own stored ±6° rotation, so the math accounts for the tilt the viewer actually sees rather than ignoring it (Finding #5). This is cheaper than exact rotated-polygon overlap and makes the invariants section's "enforced" claim literally true for the rendered geometry. The 35% per-note cap and the 60% cumulative-visibility rule are **independent** constraints and are both enforced at placement time — the 35% cap pairwise, and the 60% rule as a genuine union-coverage check (10×10 raster, reject if >40% of any note is covered by the union of notes stacking above it under the `(z_index, created_at, _id)` comparator). They do **not** collapse into one another (an earlier draft wrongly claimed the 35% cap implied the 60% rule; see step 4 of the algorithm for the counterexample). Exact rotated-polygon overlap remains a contained future change inside `notePlacement.ts` if ever wanted, but the inflated-AABB approach already removes the invariant/approximation contradiction.
5. **Report de-dup via rate limiter, not a reporters array:** one report per user per note per day via the existing limiter, avoiding a schema array of reporter ids. Simpler; flagged in case per-user report history is wanted for moderation.
6. **`'reported'` status:** present in the enum but auto-hide uses `'hidden'`. `'reported'` is reserved for a future "flagged but still shown / under review" workflow. No behavior depends on it now.
7. **No test runner exists:** adding Vitest for the pure modules is recommended per the verification guideline but introduces a dev dependency; flagged for maintainer approval. Build + lint are the mandatory gates regardless.
8. **Unverified assumption — audio assets:** `use-sound` needs actual sound files under `public/sounds/`. The repo has `public/sounds/click.mp3` (referenced by `SoundProvider`); paper-lift/paper-stick assets must be added. If none are available, the implementer should ship with sound disabled-by-default and the mute control still present (graceful: no file → no sound, no error).
9. **`createConnection` build-time safety:** `lib/promiseWallDb.ts` reads the env at import but only throws at call time, and the connection opens lazily inside handlers — verified against the spec's "guard DB calls at request time" rule and `lib/db.ts`. The build imports route modules without opening the connection, so a missing `PROMISE_WALL_DB_URL` does not break `npm run build` (only runtime requests fail with a friendly 500).

## Responses to the design review

This revision resolves every HIGH and MEDIUM finding from `design-review.md` / `design-review.json`. Precedent claims were re-verified against the real sources (`app/api/guestbook/route.ts`, `lib/userKey.ts`, `lib/rateLimit.ts`, `app/api/guestbook/upload/route.ts`, `app/(site)/guestbook/Guestbook.tsx`, `lib/cloudinary.ts`).

1. **HIGH — 60% invariant not enforced (the "reduces to 35%" error). ADDRESSED.** Step 4 of the placement algorithm now treats the 35% per-note cap and the 60% cumulative-visibility rule as two independent constraints, with the counterexample (three disjoint 20% overlaps) stated explicitly. The 60% rule is enforced as a genuine union-coverage check via a deterministic 10×10 raster (`coveredFraction` helper; reject if >40% of any note's cells are covered by the union of higher-z notes). Flagged ambiguity #4 and the testability bullet were corrected to match.

2. **HIGH — vertical re-layout determinism. ADDRESSED (Option A).** The client no longer recomputes any positions. The server computes and stores **both** orientations (`pos_x/pos_y` and `pos_x_v/pos_y_v`) by running `placeNote` twice against the current visible set, using a fixed pagination-independent vertical column width (`V_WALL_WIDTH = 420`). The type contract, schema, Layout section, placement "Determinism contract" / "Server input set", the POST order of operations (pre-generated `_id` → seed → two passes), the ownership invariants, and the orientation-flip edge case were all updated. This makes both orientations server-enforced and removes every cross-client determinism dependency.

3. **MEDIUM — `lib/profanity.ts` unspecified. ADDRESSED.** A dedicated "Profanity filter" section now defines `isClean`'s full contract: return/empty handling (`null`/empty → clean), normalization (lowercase, strip diacritics, specified leetspeak map, repeat-run collapse), whole-word (not substring) matching to avoid Scunthorpe false positives, an in-repo curated `BLOCKED` list as the single source of truth, and the two call sites (`text`, `photo_caption`, post-`sanitize`).

4. **MEDIUM — inaccurate `<img>` precedent. ADDRESSED.** Verified in `Guestbook.tsx`: stored Cloudinary attachments use `next/image` (`<Image width={640}>`, ~line 1144); plain `<img>` is only for previews/emoji. The File-inventory note now states plain `<img>` is a **deliberate deviation** (with the real rationale: rotated/absolutely-positioned, virtualized, pre-compressed, lazy) and requires `// eslint-disable-next-line @next/next/no-img-element` on every plain `<img>` or the lint/build gate fails. The DOM anatomy and upload section were updated accordingly.

5. **MEDIUM — GET cursor contradiction. ADDRESSED.** The cursor is now a true keyset on `(created_at, _id)`: parse `ISO|_id` into `{ ts, id }`, query `{ $or: [{ created_at: { $lt: ts } }, { created_at: ts, _id: { $lt: id } }], status: 'visible' }`, sort `{ created_at: -1, _id: -1 }`, `limit+1`; `nextCursor` is rebuilt symmetrically from the last doc. Malformed cursors fall back to first-page. Format/parse live in one helper.

6. **MEDIUM — ink/paper contrast "X or Y". ADDRESSED.** A server-authoritative `INK_FOR_COLOR` allow-map is specified (kraft excludes brown; blue paper excludes blue ink), enforced in POST with a new validation-table row, and mirrored in the composer for UX. Server is the authority since `color`/`ink_color` arrive independently.

7. **MEDIUM — `agree_rules` unenforceable invariant. ADDRESSED.** Simplified to a per-request rule: `agree_rules === true` required on **every** POST, no agreement record stored, no note-counting. The POST table row, the composer common-fields note, and the Validation-ownership invariant were updated.

8. **NIT — Cloudinary URL regex breadth. ADDRESSED (confirmed intentional).** The validation-table row now records the decision to keep the host-prefix check and not pin cloud-name/folder, because provenance is guaranteed by the server-stored `*_public_id` from our own upload route, not the URL.

9. **NIT — rotation ±6° not structural. ADDRESSED.** The schema `rotation` path now has `min: -6, max: 6`, making the invariant structural in addition to the `placeNote` guarantee.

10. **NIT — report limiter double composition. ADDRESSED.** Standardized on a fixed scope with the id in the identifier: `rateLimit('musafir-report', `${uid}:${id}`, 1, 86400)` → key `musafir-report:<uid>:<id>`, stated once.

## Responses to the design review (round 2)

This round addresses `design-review.json` / `design-review.md` (verdict CHANGES_REQUESTED: 0 HIGH, 5 MEDIUM, 3 NIT). Every HIGH and MEDIUM is resolved by in-place revision; the three NITs are also fixed. Each finding's precedent claim was re-verified against the real sources (`lib/userKey.ts` confirms `userKey → string | undefined`; `lib/rateLimit.ts` confirms key = `${scope}:${identifier}` and fail-open behavior).

1. **MEDIUM #1 — report dedup ran after the `$inc`. ADDRESSED.** The report route's order of operations is rewritten so the limiter (`rateLimit('musafir-report', `${uid}:${id}`, 1, 86400)`) is consulted **first** and short-circuits with `{ success: true }` before any `findOneAndUpdate`/`$inc`. A single user can no longer drive `report_count` toward the auto-hide threshold by repeat calls. The fail-open caveat is noted as acceptable.

2. **MEDIUM #2 — missing `if (!uid)` guard on report + DELETE. ADDRESSED.** Both handlers now add `const uid = userKey(session); if (!uid) return 401` after the auth check, mirroring POST. The report limiter key can no longer collapse to `musafir-report:undefined:<id>`, and DELETE compares `note.user_id !== uid` against the guaranteed-non-empty `uid`.

3. **MEDIUM #3 — z-cap tiebreak diverged from render stacking. ADDRESSED.** A single strict total-order comparator `(z_index, created_at, _id)` is now defined once and used in **both** `placeNote`'s "stacks above" selection for check (b) **and** the DOM paint order (the visible-note array is sorted by the same comparator before render). The band table, Z-index section, step-4b, the server input set (now also selecting `rotation`/`created_at`), the StickyNote render note, and the invariants section were all updated to reference it. Ceiling-z notes overlapping >40% are now rejected at insert exactly as they would render.

4. **MEDIUM #4 — undefined logical placement box. ADDRESSED.** Concrete constants live in `lib/notePlacement.ts`: `NOTE_W = 160`, `NOTE_H = 160`, `PHOTO_NOTE_H = 210`, `V_WALL_WIDTH = 420`, plus a `noteBox(isPhoto)` helper. The CSS binds `.mz-note` width/height to these via `--mz-note-w`/`--mz-note-h`, and mobile scales the whole canvas rather than shrinking individual notes, so the render box equals the placement box. The old `~160/~130px` media-query figures are explicitly superseded.

5. **MEDIUM #5 — AABB ignored rotation while invariants claimed enforcement. ADDRESSED.** A `rotatedAABB(w, h, deg)` helper inflates every note's box to the axis-aligned envelope of its rotated rectangle (`w' = w·cosθ + h·sinθ`, `h' = w·sinθ + h·cosθ`) before the overlap/union tests, using each note's own stored `rotation`. The Geometry section, step-3/step-4 math, server input set, flagged-ambiguity #4, and the invariants section are reworded to say the 35%/60% rules are enforced **on the rotation-inflated bounding box**, removing the prior contradiction. A `rotatedAABB` unit test was added.

6. **NIT #6 — z band upper bound off by the `+10` offset. ADDRESSED.** `baseZ = min(10 + z_index, 9010)` is stated once; the band table row now reads `10–9010`.

7. **NIT #7 — redundant `(+ image/png)` parenthetical. ADDRESSED.** The upload accept list is stated once as `['image/jpeg', 'image/png', 'image/webp']` with a one-line note that drawings are PNG and photos may be webp/jpeg/png; the parenthetical is removed.

8. **NIT #8 — `fonts.ts` listed under both New and Modified files. ADDRESSED.** `fonts.ts` now appears only under New files; the Modified-files area states only that root-layout fonts are not altered (so there is no font-related modification to any existing file).

All verified assumptions from the review (separate DB connection, `userKey`/`rateLimit`/`sanitize` reuse, CSP font/image facts, `<img>` deviation, cursor keyset, GET `mine`-only serialization, ink/paper map, `agree_rules` per-request rule, no test runner) were left intact; this round only tightened the five MEDIUM gaps and three NITs they surfaced.
