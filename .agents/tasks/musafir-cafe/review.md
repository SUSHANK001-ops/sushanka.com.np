# Semantic Review — Musafir Cafe Promise Wall

A new `/musafir-cafe` feature: a scrollable cafe wall of handwritten sticky notes, backed by four new REST endpoints, a separate Mongoose database, deterministic server-side note placement, a client orchestrator with virtualization, and a three-tab composer (write/draw/photo). The whole thing is additive — no pre-existing route, model, or shared library was modified. Server-side placement runs twice per create (horizontal + vertical) so each orientation independently honours a 35% per-note overlap cap and a 60% cumulative-visibility rule, and the geometry is pinned to logical constants so it is device-independent and reproducible. All five MEDIUM fixes, three NITs, the sanitize-copy note, and the sound graceful-degradation note from `design-review.md` are present in code and verified.

Watch for: the repo-wide `npm run lint` gate exits 1 — but all 15 errors are in pre-existing files (`guestbook/ui.tsx`, `Navbar.tsx`, `AnimatedAvatar.tsx`, two guestbook/admin API routes) that are **byte-identical to `main`** and that the user explicitly said must stay untouched ("it only added in new end point no change in other"). Zero lint errors originate in any Musafir Cafe file (confirmed). `npm run build` passes (exit 0). (confirmed)

**Verdict**: APPROVED

## High-level view

Isolation is clean. The feature talks to its own database through `getPromiseWallConnection()` (a distinct `global.__promiseWallConn` cache, `createConnection(...).asPromise()`), reads the env var at import but only throws at call time so `next build` never opens a connection, and the model is bound exclusively to that connection via `getPromiseNoteModel()`. The main `lib/db.ts` / `MONGODB_URI` path is untouched.

Placement determinism holds. `lib/notePlacement.ts` is a pure, seeded module. The POST route runs one query with a single projection (`pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at`) and feeds it to both passes; existing boxes are rotation-inflated and recentred via `inflatedBox` before the overlap math; the 35% cap and the 60% cumulative rule are independent checks; the exactly-40-cells boundary passes (`> 0.4` rejects); `H_WALL_HEIGHT=900` and the seed/growth constants make both axes device-independent and monotonic. `isPhoto = Boolean(photo_url)` is the single height flag at placement and render.

The API surface is small and consistent. GET is public, keyset-paginated on `(created_at, _id)`, builds `PublicNote` explicitly, and never serializes `user_id` or the `*_public_id` fields — `mine` is the only ownership signal. POST is auth-gated, validates every field (enums, lengths, the ink/paper contrast map, Cloudinary-only image URLs), runs profanity after sanitize, then two rate limits, then creates. DELETE is owner-only with best-effort Cloudinary cleanup. Report dedups before the `$inc`, uses `findOneAndUpdate` as its own 404 guard, and auto-hides at 5 reports.

The client never recomputes geometry. It reads `pos_x/pos_y` on desktop and `pos_x_v/pos_y_v` on mobile, scales the whole logical canvas to the viewport, culls to the viewport rect on rAF, and paints in the `(z_index, created_at, _id)` order. Fonts are self-hosted via `next/font/google` (CSP-safe, no Google link). Every plain `<img>` carries the eslint-disable. Sound degrades silently when the audio files are absent, and a single `prefers-reduced-motion` block disables decorative motion while keeping scroll/drag.

The only thing standing between this and a clean gate is the pre-existing repo lint debt, which is out of scope by the user's own instruction.

<details>
<summary>Issues (3)</summary>

1. **Repo-wide lint is red (pre-existing, out of scope)** — `npm run lint` exits 1 with 15 errors, all in files byte-identical to `main` and none in the feature. Not blocking under the user's "no change in other" instruction; flagged so the gate's red state is understood. If a future task wants a green repo-wide gate, those guestbook/admin/navbar/avatar files need separate fixes.
2. **Malformed `:id` yields 500 instead of 404 (minor)** — in the report and DELETE routes, a non-ObjectId `id` makes Mongoose throw a CastError that the catch turns into a 500. Low impact (ids come from server-issued notes), but a 400/404 would be tidier. (likely)
3. **Rate limiter fails open (inherited, documented)** — `rateLimit` fails open on datastore error, so report dedup and note throttles can be bypassed if the limiter's own DB is down. This is the shared `lib/rateLimit.ts` behaviour, not introduced here; noted for the security posture of the report `$inc` path. (confirmed)

</details>

<details>
<summary>Details</summary>

### Separate-DB isolation and model binding

`lib/promiseWallDb.ts` opens an isolated Mongoose connection with `mongoose.createConnection(uri).asPromise()`, caches it on `global.__promiseWallConn` (distinct from the main `global.mongoose`), reads `process.env.PROMISE_WALL_DB_URL` at import but throws only inside `getPromiseWallConnection()` — so route modules import cleanly during `next build` with the var unset, and the build output confirms all four routes compiled as dynamic functions without opening a connection. `getPromiseNoteModel()` resolves the connection and returns `conn.models.PromiseNote || conn.model('PromiseNote', schema)`, binding the model to that connection's registry only. The model file carries the NIT #6 comment that it must never be created via `mongoose.model(...)` on the default connection. The schema's three declared indexes (`created_at:-1`, `status:1`, `pos_x+pos_y`) are the migration — built on first connect.

### Placement determinism

The overlap engine is the heart of the feature and it is correct. `isValid` rejects a candidate if either the per-note overlap exceeds 35% of any existing note's area, or `coveredFraction(A, [incoming]) > 0.4`. The two are genuinely independent: the throwaway sanity check (recorded in `verification.md`, re-confirmed as deleted) proves three disjoint 20% overlaps cumulatively cover 60% and are rejected by rule (b) even though each is under the 35% cap. The boundary is exactly as specified — `coveredFraction` returns `covered/100`, and `> 0.4` means exactly 40 cells (60% visible) passes.

```
coveredFraction(A, higherZ):   > 0.40  → reject   (exactly 0.40 passes)
per-note cap:  overlapArea/areaA > 0.35 → reject
```

`coveredFraction`'s call contract (MEDIUM fix 5) is honoured: the POST route builds every existing box through `inflatedBox(pos_x, pos_y, w, h, rotation)`, which recentres to `{ pos_x: cx - w'/2, pos_y: cy - h'/2, w', h' }`, and `placeNote` inflates the incoming note the same way before sampling. At insertion the incoming note is the only higher-z box, so the union reduces to its coverage — matching the comment and the strict `(z_index, created_at, _id)` total order used client-side for paint order.

Device-independence (MEDIUM fix 3/4): the horizontal pass uses a fixed `H_WALL_HEIGHT = 900` and seeds width at `H_WALL_SEED_WIDTH = 2400`; the vertical pass fixes `V_WALL_WIDTH = 420` and seeds height at `V_WALL_SEED_HEIGHT = 2000`; both grow monotonically by `GROWTH_STEP = 1200` and never shrink. The seed is `seedFromId(_id.toHexString())` with the `_id` pre-generated before placement, so both passes share one seed (and therefore one rotation) and the result is a pure function of the final document id.

### API surface and the private-field boundary

Four endpoints, all `force-dynamic`, all `@/`-aliased, all with try/catch + `console.error` + a friendly JSON error.

`GET /notes` is public, clamps `limit` to 200 (default 100), and runs a true keyset on `(created_at, _id)` with an `$or` tie-break, `sort {created_at:-1,_id:-1}`, a `limit+1` probe, and a symmetric `nextCursor`; a malformed cursor parses to `null` and falls back to the first page. It shapes `PublicNote` through `toPublicNote()` field-by-field and never spreads the raw doc — so `user_id`, `drawing_public_id`, and `photo_public_id` are never serialized. `mine = Boolean(viewer && d.user_id === viewer)` with `viewer = userKey(session)` is the only ownership signal exposed.

`POST /notes` fails cheap-first: auth → body parse → `agree_rules === true` → content presence → lengths → display-name 2–24 → anonymity (forces `alias || 'Anonymous Musafir'`, never stores the real name publicly) → enums → the `INK_FOR_COLOR` contrast pair → image URLs must match `^https://res\.cloudinary\.com/` → public-id type/length → caption → `isClean(text) && isClean(photo_caption)` after sanitize → the `if (!uid)` guard → per-minute then per-day rate limits → placement → create. The single projection with `rotation` and `created_at` present (MEDIUM fix 1) feeds both passes.

`DELETE /notes/:id` is owner-only: 401 if no session/uid, 404 if missing, 403 if `note.user_id !== uid`, then hard delete and a best-effort `cloudinary.uploader.destroy()` per non-null public id (errors logged and swallowed, since the note is already gone).

### Report dedup, 404 guard, and auto-hide

The report route consults `rateLimit('musafir-report', \`${uid}:${id}\`, 1, 86400)` before any mutation; a denied call returns `{ success: true }` with no re-increment and without revealing the dedup. The `$inc` runs through `findOneAndUpdate({_id:id}, {$inc:{report_count:1}}, {new:true})`, whose `null` result is the 404 guard (NIT #7 — no redundant `findById`), and the returned doc drives the auto-hide at `report_count >= 5 && status === 'visible'`. The count is never sent to the client.

One inherited caveat worth stating for a mutation path: `lib/rateLimit.ts` fails open on datastore error, so if the limiter's own DB is unavailable the dedup is skipped and a single user could drive `report_count` up. Auto-hide at 5 means that is a plausible (if narrow) griefing vector. Not introduced here and consistent with the rest of the app, but it is the one place where fail-open touches a state-changing counter.

### Image provenance and the Cloudinary-only contract

The composer holds `*DataUrl` (`blob:`/object-URL previews) separately from `*Url` (Cloudinary). On submit it uploads any pending drawing/photo first and sends only `drawingUrl`/`photoUrl` in the POST body (NIT #8); the live `StickyNote` preview is the only consumer of the `*DataUrl` fields. The server independently enforces this with the `CLOUDINARY_URL_RE` test, so even a hand-crafted request carrying a `blob:`/`data:` URL is rejected with a 400. Upload itself is auth-gated, limited to `jpeg/png/webp` ≤ 5MB, and pushed to the `musafir-cafe` folder with a `width:1200,crop:limit` transformation.

### Client layout, virtualization, and stacking parity

`MusafirWall` reads orientation from `matchMedia('(min-width:1024px)')` and uses `pos_x/pos_y` on desktop, `pos_x_v/pos_y_v` on mobile — never recomputing stored coordinates. The desktop canvas renders at logical `H_WALL_HEIGHT` scaled by `clientHeight / H_WALL_HEIGHT` (MEDIUM fix 4 — not raw `100vh`), mirroring the mobile `clientWidth / V_WALL_WIDTH` scale. A viewport-rect cull (rAF-throttled, one-screen overscan) drives which notes mount, and the visible set is sorted by `compareNotes` — the strict `(z_index, created_at, _id)` ascending order (ISO `created_at` strings compare lexicographically, which is valid) — so DOM paint order equals placement stacking.

### Fonts, a11y, reduced motion, and sound degradation

Fonts load via `next/font/google` (Caveat/Kalam/Patrick_Hand/Reenie_Beanie) with page-local `--mz-*` variables and `display:'swap'`; no Google Fonts `<link>`/`@import` exists, so the CSP (`font-src 'self' data:`, no googleapis/gstatic) is satisfied. The dialogs (`NoteModal`, `RulesMailbox`) use `role="dialog"`, `aria-modal`, `aria-label`, focus-trap, and Escape-to-close; the rules mailbox is a real `<button aria-label="Read the house rules">`; decorative props are `aria-hidden`; note text renders as plain `<p>{text}</p>` (no `dangerouslySetInnerHTML`). A single `@media (prefers-reduced-motion: reduce)` block disables the light sweep, bulb twinkle, note lift/transition, new-note glow animation, and skeleton pulse while leaving scroll/drag intact. `useMusafirSound` gates `useSound` on `useSoundFx().enabled && !pageMuted` and wraps `play()` in try/catch, so the still-absent `paper-lift.mp3`/`paper-stick.mp3` produce no sound and no crash.

### Verification gates (run independently in this review)

`npm run build`: PASS (exit 0). `/musafir-cafe` is a static route; `/api/musafir-cafe/notes`, `/notes/[id]`, `/notes/[id]/report`, `/upload` are all dynamic functions in the route table — routes import with `PROMISE_WALL_DB_URL` unset.

`npm run lint`: exit 1 with 15 errors + 11 warnings. Every error is in a pre-existing file: `app/(site)/guestbook/ui.tsx` (2), `app/ui/Navbar.tsx` (1), `app/ui/delight/AnimatedAvatar.tsx` (1), `app/api/guestbook/[id]/like/route.ts` (10), `app/api/admin/guestbook/[id]/route.ts` (1). `git diff --stat main` over those five paths is empty — byte-identical to the base branch — and the `setOpen(false)` effect pattern was confirmed present on `main`'s Navbar. No Musafir Cafe file (`lib/*`, `model/*`, `app/(site)/musafir-cafe/**`, `app/api/musafir-cafe/**`) produces a lint error. Fixing the 15 would require editing the "other" code the user said to leave untouched.

</details>

<details>
<summary>File map</summary>

- `lib/promiseWallDb.ts` — isolated Mongoose connection (separate global cache, throw-at-call-time)
- `model/promiseNoteModel.ts` — `PromiseNote` schema + `getPromiseNoteModel()` bound to the wall connection
- `lib/notePlacement.ts` — pure deterministic placement (seeded PRNG, 35%/60% rules, rotation-inflated AABB, monotonic growth)
- `lib/profanity.ts` — whole-word profanity filter with leetspeak/diacritic normalization
- `app/api/musafir-cafe/notes/route.ts` — GET (keyset, public shape) + POST (validate → place → create)
- `app/api/musafir-cafe/notes/[id]/route.ts` — owner-only DELETE + Cloudinary cleanup
- `app/api/musafir-cafe/notes/[id]/report/route.ts` — dedup-before-`$inc`, 404 guard, auto-hide
- `app/api/musafir-cafe/upload/route.ts` — auth-gated Cloudinary upload
- `app/(site)/musafir-cafe/types.ts` — shared type contract + `INK_FOR_COLOR` allow-map
- `app/(site)/musafir-cafe/fonts.ts` — self-hosted handwriting faces
- `app/(site)/musafir-cafe/page.tsx` — server page, provider detection, font scope
- `app/(site)/musafir-cafe/MusafirWall.tsx` — client orchestrator (scroll, cull, scale, stacking)
- `app/(site)/musafir-cafe/components/*` — StickyNote, Composer, DrawCanvas, NoteModal, WallBackdrop, WallProps, LeaveNoteButton, RulesMailbox, useMusafirSound
- `app/(site)/musafir-cafe/musafir-cafe.css` — page-scoped styles + single reduced-motion block
- `app/(site)/musafir-cafe/SETUP.md` + `.env.example` — new `PROMISE_WALL_DB_URL`, indexes-are-the-migration note

Full diff: `git diff main` on branch `musafir-cafe`.

</details>
