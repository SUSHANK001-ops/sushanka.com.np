# Design Review — Musafir Cafe Promise Wall

Reviewed: `design.md` (post round-2 revision) against the live codebase at the workspace root.
Method: read the design in full, then verified every precedent/API claim against the actual source files (`lib/db.ts`, `lib/userKey.ts`, `lib/rateLimit.ts`, `lib/cloudinary.ts`, `auth.ts`, `next.config.ts`, `app/api/guestbook/route.ts`, `app/api/guestbook/upload/route.ts`, `app/(site)/guestbook/Guestbook.tsx`, `app/(site)/guestbook/ui.tsx`, `app/layout.tsx`, `app/ui/Providers.tsx`, `app/ui/sound/SoundProvider.tsx`, `package.json`, `types.d.ts`, `.env.example`). No builds or test suites were run.

Note: there is no separate original-task/requirements file in `.agents/tasks/musafir-cafe/` (only `design.md` and the prior review artifacts). The spec is therefore inferred from the design's own quoted requirements and the review brief. Findings about "the spec says X" are judged against the design's internal self-consistency and the review brief's enumerated requirements.

The design is strong and has already closed the HIGH issues from prior rounds (both-orientation server-side placement, the independent 35%/60% constraints, the rotation-inflated AABB, the keyset cursor, the total-order stacking comparator). The findings below are what remains.

---

## Findings

### 1. MEDIUM — POST "Order of operations" select omits fields the placement check requires

The POST **Order of operations** paragraph says: *"load visible note boxes (`pos_x pos_y pos_x_v pos_y_v photo_url z_index`)"*. But the placement algorithm's **Server input set** section says the query must `select pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at`, and check (b) (cumulative visibility) depends on both `rotation` (to build each existing note's `rotatedAABB`) and `created_at` (one of the three keys in the `(z_index, created_at, _id)` stacking comparator). An implementer who follows the Order-of-operations list literally will omit `rotation` and `created_at`, so `rotatedAABB` runs on `undefined` and the comparator loses its middle key — silently corrupting the 60% invariant the whole revision exists to protect.

Where: POST handler "Order of operations" vs "Note placement algorithm → Server input set".

Fix: make the two lists identical. Change the Order-of-operations select to:
`load visible notes (select pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at; _id is returned by default)`. State once that this single projection feeds both placement passes.

### 2. MEDIUM — `isPhoto` is needed for every existing note's box but is not in the projection

Both placement passes compute each existing note's rotation-inflated box as `rotatedAABB(NOTE_W, isPhoto ? PHOTO_NOTE_H : NOTE_H, rotation)` (Server input set section). Determining `isPhoto` requires knowing whether each existing note is a photo note. The projection selects `photo_url`, and the design elsewhere implies `isPhoto = Boolean(photo_url)` — but this derivation is never stated, and `photo_url` being non-null is not clearly equivalent to "uses `PHOTO_NOTE_H`" for a note that has *both* a photo and text/drawing. If `isPhoto` is mis-derived, the existing-note heights used in the overlap math won't match the heights those notes were actually placed/rendered at, breaking the 35%/60% guarantee for mixed notes.

Where: "Note placement algorithm → Server input set" and the `noteBox(isPhoto)` helper.

Fix: state the rule explicitly and once: *"a note uses `PHOTO_NOTE_H` iff `photo_url` is non-null (`isPhoto = Boolean(photo_url)`); this is the only height-determining flag and it is derived identically at placement time and at render time."* Confirm the DOM anatomy's `.mz-note--photo` taller box is applied under exactly the same `photo_url != null` condition so render height always equals placement height.

### 3. MEDIUM — Vertical-pass wall width/height seed and growth are under-specified

The horizontal pass derives its initial `wall.width` from "the max `pos_x` + note width + margin" and grows by "one screen-dimension". The vertical pass fixes `wall.width = V_WALL_WIDTH = 420`, but the design never states the vertical pass's **initial `wall.height`** nor the exact growth increment for the vertical axis ("grows via the same step-5 growth rule ... but along the height axis" — the horizontal rule grows by "one screen-dimension", which is undefined for a server with no viewport). Because placement is order- and state-dependent and the design's own correctness argument rests on determinism, an unspecified seed height / growth step is a real reproducibility gap: two server deployments (or a re-run during a backfill) could diverge.

Where: "Layout" (vertical wall height) and placement step 5.

Fix: pin concrete server-side constants in `lib/notePlacement.ts`, e.g. `H_WALL_SEED_WIDTH`, `V_WALL_SEED_HEIGHT`, and a fixed `GROWTH_STEP` in logical px (not "one screen-dimension", which has no meaning server-side). Example: `V_WALL_WIDTH = 420`, `V_WALL_SEED_HEIGHT = 2000`, grow height by `GROWTH_STEP = 1200` per extension; horizontal seeds `H_WALL_SEED_WIDTH = 2400`, `wall.height = <fixed logical canvas height, e.g. 900>`, grow width by `GROWTH_STEP`. State that growth never shrinks and is monotonic so re-placement of the same note set is stable.

### 4. MEDIUM — Horizontal canvas height is undefined, yet the 2D placement/overlap math depends on it

Desktop `.mz-canvas` `height` is described as "= viewport height" (a client value). But placement runs server-side with no viewport, and the overlap math is 2D (`pos_y` matters). If the server places horizontal notes against a `wall.height` that differs from the height the client renders the canvas at, notes can be positioned at `pos_y` values that overflow or compress on the client, and the 35%/60% invariant (computed against the server's `wall.height`) won't match what the viewer sees. The vertical pass fixed its width to a logical constant for exactly this reason; the horizontal pass needs the same treatment for height.

Where: "Layout → Desktop" and "Note placement algorithm" (`wall.height` for the horizontal pass).

Fix: define a fixed logical horizontal canvas height constant (e.g. `H_WALL_HEIGHT = 900` logical px) in `lib/notePlacement.ts`, use it as the horizontal pass's `wall.height`, and render the desktop canvas at that logical height scaled to the viewport (mirroring the mobile "scale the whole canvas" decision) rather than setting canvas height to raw `100vh`. This makes horizontal placement geometry device-independent and reproducible, matching the vertical pass.

### 5. MEDIUM — `coveredFraction` ignores the inflated box's recentred origin / out-of-grid higher-z boxes partially

`coveredFraction` rasterizes note A into a 10×10 grid using `A.pos_x`/`A.pos_y` as the box origin and counts a cell covered if its center lies inside any higher-z box. Two gaps: (a) the design says "`w`/`h` for a note mean its rotation-inflated `w'`/`h'`" and that the inflated box keeps the same center with `x' = cx - w'/2`, but `coveredFraction`'s signature takes `{ pos_x, pos_y, w, h }` and samples from `pos_x`/`pos_y` as the top-left — it must be called with the *recentred* inflated origin (`pos_x' = cx - w'/2`), which is never stated at the call site, so an implementer may pass the stored top-left with inflated `w'/h'` and sample a box that is offset from the real inflated envelope. (b) The threshold uses `> 40` cells, i.e. >40% → reject; the prose elsewhere says "less than 60% visible" → reject, which is `covered > 40%` → the boundary case of *exactly* 40 covered cells (60% visible) is accepted. That is self-consistent, but the "visible" wording ("keeps ≥60% of its area visible") means 60.0% exactly must be *allowed*; `> 40` allows it. Confirm and state the boundary explicitly so it isn't "re-interpreted" during implementation.

Where: `coveredFraction` definition + its invocation in step 4b + the invariants section.

Fix: (a) specify the call contract: *"callers pass the rotation-inflated, recentred box: `{ pos_x: cx - w'/2, pos_y: cy - h'/2, w: w', h: h' }` for both A and every higher-z box."* (b) State the boundary once: *"reject iff strictly more than 40 of 100 cells are covered; exactly 40 (≥60% visible) passes."*

### 6. NIT — `getPromiseNoteModel` reuses the schema across a per-connection registry; confirm single-schema binding

`getPromiseNoteModel` does `conn.models.PromiseNote || conn.model('PromiseNote', PromiseNoteSchema)`. This is correct for one long-lived connection. In dev/HMR, `createConnection` may be re-invoked; the `__promiseWallConn` global cache guards that, which is good. No change required, but add a one-line note that the model must only ever be created via `getPromiseNoteModel()` (never `mongoose.model(...)` on the default connection) so no one accidentally binds it to the main DB.

Where: `model/promiseNoteModel.ts`.

Fix: add the comment; no logic change.

### 7. NIT — Report route does a redundant `findById` before `findOneAndUpdate`

The report handler calls `Model.findById(id)` (404 guard) and then `Model.findOneAndUpdate({ _id: id }, { $inc ... }, { new: true })`. The `findById` is a second round-trip whose only purpose is the 404; `findOneAndUpdate` already returns `null` when no doc matches. Minor, but worth collapsing.

Where: `POST /api/musafir-cafe/notes/[id]/report`.

Fix: drop the `findById`; use the `findOneAndUpdate` result: `if (!updated) return 404`. (Keeps the auto-hide check on the same returned doc.)

### 8. NIT — `drawing_url`/`photo_url` regex vs `blob:`/`data:` preview URLs

Server validation requires `*_url` to match `^https://res\.cloudinary\.com/`. The composer's `draft` holds `drawingDataUrl`/`photoDataUrl` as `blob:`/`data:` previews and only the post-upload `drawingUrl`/`photoUrl` (Cloudinary) are sent. This is consistent, but the design should state once that **only** the Cloudinary `*Url` fields are ever placed in the POST body's `drawing_url`/`photo_url` — never the preview `*DataUrl` — so an implementer doesn't accidentally submit a `blob:` URL and trip the 400.

Where: Composer submit flow + POST validation table.

Fix: one sentence in the submit flow: *"submit sends only `draft.drawingUrl`/`draft.photoUrl` (Cloudinary); the local `*DataUrl` previews are never sent."*

---

## Verdict

5 MEDIUM + 3 NIT. Per the mechanical rule (any HIGH or MEDIUM ⇒ CHANGES_REQUESTED), the verdict is **CHANGES_REQUESTED**. All five MEDIUM findings are tightenings of the server-side placement determinism/field-flow that the design's own correctness argument depends on; none require re-architecting. A quick revision pass should clear them.

---

## Verified assumptions (checked against source)

- **Separate Mongoose connection shape.** `lib/db.ts` uses `connect()` + the `global.mongoose` cache (`types.d.ts` types it as `{ conn, promise }`). The design's `createConnection(uri).asPromise()` with a distinct `global.__promiseWallConn` key does not collide, and `createConnection` yields an isolated `.model()` registry — correct for Mongoose `^9.2.1` (confirmed in `package.json`). Reading `process.env` at import and throwing only at call time matches the "guard DB at request time" rule; route modules can be imported during `next build` without opening the connection. **Verified.**
- **Model bound to the separate connection via `conn.model(...)`** rather than the global `mongoose.models`. **Verified** as the correct pattern.
- **`userKey` returns `string | undefined`** (lowercased email, else lowercased id, else undefined). The defensive `if (!uid) return 401` guards in POST/DELETE/report are justified. `auth.ts` additionally sets `session.user.id` to the lowercased email/sub, so in practice `uid` is almost always defined when a session exists — the guard is still correct and harmless. **Verified** (`lib/userKey.ts`, `auth.ts`).
- **`rateLimit(scope, identifier, limit, windowSeconds)`** composes the key as `${scope}:${identifier}`, calls `connectDB()` itself (main DB), and **fails open** on datastore error. The report dedup key `musafir-report` + `${uid}:${id}` and the limiter-before-`$inc` ordering are correct, and the fail-open caveat is accurately described. **Verified** (`lib/rateLimit.ts`).
- **GET omits `user_id`, exposes only `mine`.** The design builds `PublicNote` explicitly and never spreads the raw doc, mirroring the guestbook GET's explicit shaping. `mine = Boolean(viewer && note.user_id === viewer)` with `viewer = userKey(session)`. **Verified** as sound (and consistent with `app/api/guestbook/route.ts`'s `likedByMe` pattern).
- **Keyset cursor** on `(created_at, _id)` with `$or` tie-break, `sort { created_at:-1, _id:-1 }`, `limit+1` probe, symmetric `nextCursor`, malformed-cursor → first page. Covered by the declared `created_at:-1` index (`_id` always indexed). **Verified** as internally correct.
- **`sanitize()` reuse.** Guestbook's `sanitize` strips `[\u0000-\u001f\u007f]`, collapses whitespace, trims — exactly as the design quotes. **Verified** (`app/api/guestbook/route.ts`). (It is a module-local function, not an exported lib — see Unverified notes.)
- **Cloudinary.** `lib/cloudinary.ts` default-exports the configured v2 client; the guestbook upload route uses `cloudinary.uploader.upload(..., { folder, transformation:[{width:1200,crop:'limit'}] })` and returns `{ url: secure_url, publicId: public_id }`. The design's upload route (folder `musafir-cafe`, 5MB, accept `jpeg/png/webp`) and DELETE's `cloudinary.uploader.destroy(publicId)` match the available API. **Verified** (`lib/cloudinary.ts`, `app/api/guestbook/upload/route.ts`).
- **CSP / `next.config.ts`.** `img-src` already allows `'self' data: blob: https://res.cloudinary.com`; `font-src 'self' data:`; `style-src 'self' 'unsafe-inline'`; `fonts.googleapis.com`/`fonts.gstatic.com` are **not** allowlisted. So a Google-Fonts `<link>`/`@import` would be CSP-blocked and `next/font/google` (self-hosted) is the correct choice; no config change needed for images or fonts. **Verified** (`next.config.ts`).
- **`next/font/google` precedent.** `app/layout.tsx` already loads `Caveat` via `next/font/google` with a CSS variable. The design's `fonts.ts` re-declaring Caveat/Kalam/Patrick_Hand/Reenie_Beanie with page-local `--mz-*` variables and scoping all font rules under `.musafir-wall-root` (not touching the root layout) is a valid, non-leaking approach. Reenie Beanie / Patrick Hand only ship weight 400 — the design requests exactly `['400']` for both. **Verified.**
- **`<img>` vs `next/image` precedent.** `Guestbook.tsx` renders *stored* Cloudinary attachments with `<Image width={640} height={400}>` (~line 1146) and uses plain `<img>` + `// eslint-disable-next-line @next/next/no-img-element` only for previews/emoji (~lines 147, 918, 1087). The design correctly labels its plain-`<img>` choice for on-wall notes a **deliberate deviation** and mandates the eslint-disable directive on every such tag. **Verified.**
- **`SignInPopup` contract.** `app/(site)/guestbook/ui.tsx` exports `SignInPopup({ open, action='do that', onClose, onSignIn })` (composes its own copy from `action`; no free-form message prop) plus `ToastProvider`/`useToast`. The design's `action="leave your note"` usage and reuse of the toast primitives match. **Verified.**
- **`use-sound` + `useSoundFx`.** `use-sound@^5.0.0` is in `package.json`; `app/ui/sound/SoundProvider.tsx` exports `useSoundFx()` → `{ enabled, toggle }` and `SoundProvider` wraps all pages via `app/ui/Providers.tsx`, so the musafir page can read the global mute preference. **Verified.**
- **Auth is Google-only.** `auth.ts` registers only the Google provider; the design's "existing Auth.js Google flow" is accurate. (`.env.example` mentions GitHub, but `auth.ts` does not register it — a pre-existing repo inconsistency, not this design's concern.) **Verified.**
- **No test runner.** `package.json` has no jest/vitest; `lint` = `eslint`, `build` = `next build`. The design's "add Vitest, flagged for approval; build+lint are the gates" is accurate. **Verified.**
- **`.env.example` exists** and the design's append-only new section is safe (existing values untouched). **Verified.**
- **Rotation ±6° structural.** Schema `rotation: { min:-6, max:6 }` plus `placeNote` clamping — double-enforced. **Verified** as consistent.

## Unverified / wrong assumptions

- **`sanitize()` is "reused verbatim" — but it is not exported.** In `app/api/guestbook/route.ts`, `sanitize` is a **private module-local function**, not an exported helper. The design says it is "reused verbatim from guestbook" and the testability section proposes importing it. As written it cannot be imported; the implementer must either copy the identical function into the musafir route / a shared `lib/` module, or export it from the guestbook route. Not a blocker (the function body is trivial and the design quotes it exactly), so recorded here rather than as a finding — but the word "reuse" overstates what is importable today. **Partially wrong** (behavior verified, importability wrong).
- **`agree_rules` enforcement.** Verified as internally consistent (per-request `=== true`, no stored record). There is no server-side precedent to check against (the guestbook has no such field), so this is accepted on design logic alone, not cross-checked against existing code. **Unverified against precedent** (sound by inspection).
- **Profanity filter (`lib/profanity.ts`).** Net-new; the design confirms (and I confirmed) there is no existing profanity lib in the repo. The contract is fully specified and testable. Nothing to verify against; correctness depends on the implementation. **Unverified** (net-new, as expected).
- **`V_WALL_WIDTH`/`NOTE_W`/`NOTE_H`/`PHOTO_NOTE_H` and the horizontal/vertical seed+growth constants** are design-chosen; there is no existing code to verify them against, and findings 3–4 flag that the horizontal height and both-axis seed/growth values are not yet all pinned. **Unverified / incomplete by design.**
- **Audio assets** (`public/sounds/paper-lift.mp3`, `paper-stick.mp3`) do not exist yet (only `public/sounds/click.mp3` is referenced by `SoundProvider`); the design flags this and specifies graceful degradation. **Confirmed missing** (handled as a documented flag, not a finding).
