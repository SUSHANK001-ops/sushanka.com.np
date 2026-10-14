# Implementation Plan — Musafir Cafe Promise Wall

Build EXACTLY what `design.md` specifies, with all 5 MEDIUM fixes, 3 NITs, the sanitize-copy note, and the sound graceful-degradation note from `design-review.md` baked in. Workspace root (Windows absolute): `c:\Users\susha\OneDrive\Desktop\Webdevstuff\Animated-port`.

Stack facts (verified): Next.js 16.1.6 App Router, React 19.2, TS 5, Tailwind v4, Mongoose ^9.2.1, `use-sound` ^5.0.0, Auth.js v5 (`auth.ts` at repo root, Google-only), Cloudinary v2 (`lib/cloudinary.ts`). No test runner in `package.json` — DECISION: do not add one. Mandatory gates: `npm run build` and `npm run lint`. Do NOT run `npm run dev`. NO git commits — leave files changed in the working tree.

Reused precedents (confirmed to exist): `lib/db.ts`, `lib/userKey.ts` (`userKey → string | undefined`), `lib/rateLimit.ts` (`rateLimit(scope, identifier, limit, windowSeconds)` keyed `${scope}:${identifier}`, fails open, `getClientIp(req)`), `lib/cloudinary.ts` (default-exported v2), `app/api/guestbook/upload/route.ts` (upload pattern), `app/api/guestbook/route.ts` (local `sanitize()`, model-guard), `app/(site)/guestbook/ui.tsx` (`SignInPopup`, `ToastProvider`, `useToast`), `app/ui/sound/SoundProvider.tsx` (`useSoundFx() → { enabled, toggle }`), `app/(site)/layout.tsx` (shared site layout), `.env.example`, `next.config.ts` (CSP already allows cloudinary img-src + `data:`/`blob:`; `font-src 'self' data:` — no googleapis/gstatic).

Cross-cutting decisions (apply everywhere):
- Every API route: `export const dynamic = 'force-dynamic'`, `NextResponse.json`, try/catch + `console.error` + friendly JSON error, `@/` import alias, DB guarded at request time via `getPromiseNoteModel()` (never at import).
- `user_id` is PRIVATE: never serialized in any response; `mine` is the only ownership signal. `drawing_public_id`/`photo_public_id` also private.
- Every plain `<img>` for note/preview images MUST be preceded by `// eslint-disable-next-line @next/next/no-img-element` (deliberate deviation; lint gate fails otherwise).
- Fonts via `next/font/google` only (self-hosted) — never a Google Fonts `<link>`/`@import` (CSP would block). Do NOT alter root-layout fonts.

---

## Phase 1 — Separate DB, model, and pure libraries (foundation)

- [ ] 1. Create the separate Mongoose connection module. `getPromiseWallConnection()` uses `mongoose.createConnection(process.env.PROMISE_WALL_DB_URL).asPromise()`, cached on a distinct `global.__promiseWallConn` key, reads env at import but THROWS only at call time (so `next build` stays safe). Do not touch `lib/db.ts`/`MONGODB_URI`.
      Files: `lib/promiseWallDb.ts`
      Verify: `npx tsc --noEmit` has no new errors in this file (full gate runs in Phase 7); file compiles as part of `npm run build` later.

- [ ] 2. Create the Mongoose model bound to the separate connection via `getPromiseNoteModel()` async getter: `conn.models.PromiseNote || conn.model('PromiseNote', schema)`. Fields per design: `user_id` (PRIVATE, required, index), `display_name`, `is_anonymous`, `text`, `font`, `color`, `ink_color`, `drawing_url`, `photo_url`, `drawing_public_id` (PRIVATE), `photo_public_id` (PRIVATE), `photo_caption`, `pos_x`, `pos_y`, `pos_x_v`, `pos_y_v`, `rotation` (`min:-6, max:6`), `z_index`, `pin_style`, `status` (`['visible','hidden','reported']` default `visible`, index), `report_count`, timestamps mapped to `created_at`/`updated_at`. Indexes: `{created_at:-1}`, `{status:1}`, `{pos_x:1,pos_y:1}`.
      NIT #6: add a one-line comment that the model must ONLY be created via `getPromiseNoteModel()` on the separate connection, never `mongoose.model(...)` on the default connection.
      Files: `model/promiseNoteModel.ts`
      Verify: compiles under the Phase 7 build; types export `IPromiseNote` and `getPromiseNoteModel`.

- [ ] 3. Create the deterministic placement library. Export constants `NOTE_W=160`, `NOTE_H=160`, `PHOTO_NOTE_H=210`, `V_WALL_WIDTH=420`, plus the server-side constants from MEDIUM fix 3/4: `H_WALL_HEIGHT=900`, `H_WALL_SEED_WIDTH=2400`, `V_WALL_SEED_HEIGHT=2000`, `GROWTH_STEP=1200`. Export `noteBox(isPhoto)`, `rotatedAABB(w,h,deg)`, `coveredFraction(A, higherZBoxes)` (10×10 raster, cell-center sampling), and `placeNote(input)` with the mulberry32 seeded PRNG, jittered grid, density pick, ±6° rotation, and the two independent rejection constraints.
      MEDIUM fix 2 — `isPhoto = Boolean(photo_url)` is the ONLY height-determining flag, used identically at placement and render.
      MEDIUM fix 3 — growth is monotonic: horizontal grows `wall.width` by `GROWTH_STEP` from seed `H_WALL_SEED_WIDTH`; vertical fixes `wall.width = V_WALL_WIDTH` and grows `wall.height` by `GROWTH_STEP` from seed `V_WALL_SEED_HEIGHT`; never shrink.
      MEDIUM fix 4 — horizontal pass uses fixed `wall.height = H_WALL_HEIGHT` (device-independent), not a viewport value.
      MEDIUM fix 5 — `coveredFraction` callers pass the rotation-inflated, RECENTRED box `{ pos_x: cx - w'/2, pos_y: cy - h'/2, w: w', h: h' }` for note A AND every higher-z box; boundary rule: reject iff STRICTLY MORE THAN 40 of 100 cells covered (exactly 40 = ≥60% visible PASSES). "Stacks above" uses the strict total-order comparator `(z_index, created_at, _id)`.
      Files: `lib/notePlacement.ts`
      Verify: Phase 7 throwaway node script exercises the 35% cap, the three-disjoint-20%-overlaps 60% case (must reject), the exactly-40-cells boundary (must pass), `rotatedAABB` identity at 0° / ~10% growth at 6°, and determinism (same seed → same result).

- [ ] 4. Create the profanity filter. `isClean(input): boolean` — `null`/empty/whitespace → `true`; normalize (lowercase → strip diacritics via NFKD + remove `/[\u0300-\u036f]/g` → leetspeak map `@→a 0→o 1→i 3→e $→s 5→s 7→t 4→a` → collapse runs >2 to 2); tokenize on `/[^a-z]+/`; dirty iff any token EXACTLY equals a `BLOCKED` entry (whole-word, not substring, to avoid the Scunthorpe problem). `BLOCKED` is a small curated in-repo constant.
      Files: `lib/profanity.ts`
      Verify: Phase 7 throwaway node script checks clean strings, dirty whole words, Scunthorpe-type non-matches, and leetspeak/diacritic normalization.

## Phase 2 — API routes

- [ ] 5. Create the upload route: auth required, `['image/jpeg','image/png','image/webp']`, max 5MB, `cloudinary.uploader.upload(..., { folder: 'musafir-cafe', transformation:[{width:1200,crop:'limit'}] })`, returns `{ url, publicId }`, upload limiter `rateLimit('musafir-upload', getClientIp(req), 12, 3600)`. Mirror `app/api/guestbook/upload/route.ts`.
      Files: `app/api/musafir-cafe/upload/route.ts`
      Verify: Phase 7 build + lint pass.

- [ ] 6. Create the notes list/create route. GET: public keyset pagination on `(created_at, _id)` (`limit` default 100 clamp 200, cursor `ISO|_id` parsed into `{ts,id}` with `$or` tie-break, `sort {created_at:-1,_id:-1}`, `limit+1` probe, symmetric `nextCursor`, malformed cursor → first page); build `PublicNote` explicitly, NEVER spread the raw doc, NEVER return `user_id`; `mine = Boolean(viewer && note.user_id === viewer)` with `viewer = userKey(await auth())`.
      POST: order of operations — auth → body parse → field validation (incl. `INK_FOR_COLOR` pair map, enums, lengths, display_name 2–24, anonymity→forced public name, `agree_rules===true`, content presence, `*_url` must match `^https://res\.cloudinary\.com/`) → `isClean(text)` and `isClean(photo_caption)` AFTER sanitize → `rateLimit('musafir-note-min', uid, 1, 60)` then `rateLimit('musafir-note-day', uid, 20, 86400)` → `uid = userKey(session)` guarded with `if(!uid) return 401` BEFORE rate-limit/create → connect wall DB → load visible notes with projection `pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at` (MEDIUM fix 1: identical projection feeds both placement passes; `rotation` and `created_at` are REQUIRED) → assign `z_index = min(maxZ+1, Z_CAP)` → pre-generate `_id` → compute seed from `_id` → run `placeNote` TWICE (horizontal → `pos_x/pos_y`, vertical → `pos_x_v/pos_y_v`, shared `rotation`) → `create` with explicit `_id` + private `user_id` → return `PublicNote` with `mine:true`.
      sanitize-copy note: COPY the identical guestbook `sanitize()` logic inline (or into a tiny shared `lib/` helper) — it is a PRIVATE module-local function in the guestbook route and CANNOT be imported.
      NIT #8: POST body carries only Cloudinary `drawing_url`/`photo_url`; never `blob:`/`data:` previews.
      Files: `app/api/musafir-cafe/notes/route.ts` (and a small sanitize helper if factored into `lib/`)
      Verify: Phase 7 build + lint pass.

- [ ] 7. Create the delete route: owner-only. `auth()` → `if(!session?.user) 401` → `uid = userKey(session)`, `if(!uid) 401` → load by id, 404 if missing → `if(note.user_id !== uid) 403` → hard delete → best-effort `cloudinary.uploader.destroy()` on each non-null `drawing_public_id`/`photo_public_id` (catch+log+swallow) → `{ success: true }`.
      Files: `app/api/musafir-cafe/notes/[id]/route.ts`
      Verify: Phase 7 build + lint pass.

- [ ] 8. Create the report route: auth required. `auth()` → `if(!session?.user) 401` → `uid`, `if(!uid) 401` → `rateLimit('musafir-report', `${uid}:${id}`, 1, 86400)` consulted BEFORE any `$inc`; if not allowed return `{ success:true }` (no re-increment). NIT #7: drop the redundant `findById` — use the `findOneAndUpdate({_id:id},{ $inc:{report_count:1} },{ new:true })` result as the 404 guard (`if(!updated) 404`); auto-hide when `updated.report_count >= 5 && status==='visible'` → set `hidden` and save → `{ success:true }`.
      Files: `app/api/musafir-cafe/notes/[id]/report/route.ts`
      Verify: Phase 7 build + lint pass.

## Phase 3 — Page shell, backdrop, decorative props

- [ ] 9. Create the shared type contract and ink/paper allow-map. `NoteFont`, `NoteColor`, `NoteInk`, `PinStyle`, `PublicNote`, and `INK_FOR_COLOR` (kraft excludes brown; blue paper excludes blue ink). Imported by the POST handler AND the composer.
      Files: `app/(site)/musafir-cafe/types.ts`
      Verify: Phase 7 build.
      Note: if Phase 2 was authored first and inlined these, keep a single source of truth in `types.ts` and import from the route — do not duplicate the map.

- [ ] 10. Create the fonts module (`next/font/google`): `Caveat` (400–700), `Kalam` (300/400/700), `Patrick_Hand` (400), `Reenie_Beanie` (400), each with a page-local `--mz-*` CSS variable and `display:'swap'`.
      Files: `app/(site)/musafir-cafe/fonts.ts`
      Verify: Phase 7 build (self-hosted fonts resolve).

- [ ] 11. Create the server page: metadata, Google-provider detection, applies all four font `.variable` classes + `musafir-wall-root` scope class on the root wrapper, renders `MusafirWall`. Route resolves to `/musafir-cafe` under `app/(site)/`.
      Files: `app/(site)/musafir-cafe/page.tsx`
      Verify: Phase 7 build; route compiles.

- [ ] 12. Create the backdrop and props. `WallBackdrop` renders the layer stack (wood base, wire-mesh grid, top beam, floor strip) at the z-bands in the design; light sweep + vignette as `position:fixed` `pointer-events:none` overlays (opacity ≤0.18). `WallProps` renders repeating prop clusters at `z-index:3` (two mailbox houses, drawer cabinet + pen cup, fairy lights, potted plant, hanging "Musafir Cafe" sign with warm GENERIC traveler-cafe tagline, pins/washi, chalkboard "Leave a promise"); all props `aria-hidden` + `pointer-events:none` except the rules mailbox. Clusters mounted only near the viewport (same cull as notes).
      Files: `app/(site)/musafir-cafe/components/WallBackdrop.tsx`, `app/(site)/musafir-cafe/components/WallProps.tsx`
      Verify: Phase 7 build + lint.

## Phase 4 — Sticky-note anatomy, scroll, virtualization (orchestrator)

- [ ] 13. Create the sticky note component. Absolutely-positioned `<article>` at `left/top`, `--rot`, `z-index: baseZ = min(10 + z_index, 9010)`; `tabindex=0`, `role=button`, descriptive `aria-label`; optional pin/tape, adhesive strip, curled corner, paper texture + gradient per `mz-color-*`, ink via `mz-ink-*`, font via `mz-font-*`. Photo notes apply `.mz-note--photo` (taller box) under EXACTLY the `photo_url != null` condition (MEDIUM fix 2 — render height equals placement height). Plain `<img>` for photo/drawing, each with the eslint-disable directive. `.mz-note-text` is plain `<p>{text}</p>`, never `dangerouslySetInnerHTML`. `mine` renders a subtle pin marker. Enter/Space/click opens the modal; `:focus-visible` ring survives the lift transform.
      Files: `app/(site)/musafir-cafe/components/StickyNote.tsx`
      Verify: Phase 7 build + lint.

- [ ] 14. Create the orchestrator `MusafirWall` (`'use client'`): data fetch with keyset pagination + infinite scroll toward the far edge; layout mode via `matchMedia('(min-width:1024px)')` reading `pos_x/pos_y` on desktop and `pos_x_v/pos_y_v` on mobile (never recompute positions); desktop canvas rendered at logical `H_WALL_HEIGHT=900` scaled to fit the viewport (MEDIUM fix 4 — mirror the mobile "scale the whole canvas" approach, NOT raw 100vh); wheel→horizontal scroll (`{passive:false}`, shift+wheel passthrough), drag-to-pan (<5px = click; ignore pointerdown on notes/interactive props), custom slim scrollbar + left/right arrow buttons (desktop only); mobile vertical touch scroll; viewport-rect cull throttled with rAF (overscan one screen) driving note AND prop-cluster mounting; render list sorted by the `(z_index, created_at, _id)` comparator ascending so DOM paint order equals placement stacking; React keys by note id; skeleton/empty ("The wall is waiting for its first story.")/error states; composer + modal + sign-in state; new-note insert → pan into view + slap + `.mz-note--new` glow.
      Files: `app/(site)/musafir-cafe/MusafirWall.tsx`
      Verify: Phase 7 build + lint.

- [ ] 15. Create the floating "Leave a promise" button (fixed bottom-right, `z-index:10000`, sticky-note shaped). Signed-out click → `SignInPopup` (`action="leave your note"`, `onSignIn={(p)=>signIn(p,{callbackUrl:'/musafir-cafe'})}`). Create the rules mailbox trigger wiring (`RulesMailbox` opens the house-rules popup with warm generic rules copy; real `<button>`, `aria-label="Read the house rules"`, Enter/Space/click).
      Files: `app/(site)/musafir-cafe/components/LeaveNoteButton.tsx`, `app/(site)/musafir-cafe/components/RulesMailbox.tsx`
      Verify: Phase 7 build + lint.

## Phase 5 — Composer (write/draw/photo) and read modal

- [ ] 16. Create the draw canvas. `<canvas>` with `touch-action:none` + Pointer Events (`setPointerCapture`), tools pen/marker (wider, semi-transparent)/eraser (`destination-out`), undo/redo (stroke-list), clear, 8 inks, 3 sizes; export transparent PNG via `canvas.toBlob('image/png')` → object URL preview. Keep the drag-vs-click and stroke math in pure helpers where practical.
      Files: `app/(site)/musafir-cafe/components/DrawCanvas.tsx`
      Verify: Phase 7 build + lint.

- [ ] 17. Create the three-tab composer. Single shared `draft` state across Write/Draw/Photo tabs + common fields; portaled modal, focus-trapped, Escape-to-close (reuse guestbook modal conventions). WRITE: handwriting `<textarea>`, 280 char counter, font picker (4 faces), paper color picker (7 colors). DRAW: embeds `DrawCanvas`. PHOTO: file input (jpg/png/webp ≤5MB), client resize to ~1200px longest edge via offscreen canvas `toBlob('image/webp',0.85)` with jpeg fallback, polaroid preview + caption. Common: display name 2–24, "Stay a mystery" anonymous toggle + optional alias, rules "I agree" tick (persist `localStorage musafir-rules-agreed`, still send `agree_rules:true` every submit). Live `StickyNote` preview from `draft`. Ink swatches rendered from `INK_FOR_COLOR[draft.color]`, reset ink when paper changes. Submit "Stick it on the wall": upload pending drawing/photo first, POST only Cloudinary `drawingUrl`/`photoUrl` (NIT #8 — never `*DataUrl` previews), on success close + insert + slap + glow; error → toast "The paper slipped. Let's try sticking it again." Reuse `ToastProvider`/`useToast`/`SignInPopup` from `../guestbook/ui`.
      Files: `app/(site)/musafir-cafe/components/Composer.tsx`
      Verify: Phase 7 build + lint.

- [ ] 18. Create the read modal + report/delete wiring. `NoteModal` shows full note, full-size drawing/photo, display name, date; portaled, focus-trapped, Escape-to-close; soft mutable paper-lift sound on open. Report action → POST report route; owner sees delete → DELETE route with optimistic removal.
      Sound graceful-degradation: a `useMusafirSound()` wrapper gates `useSound` by the global `useSoundFx().enabled` preference AND a page-level mute; `public/sounds/paper-lift.mp3`/`paper-stick.mp3` do NOT exist yet — if a file is absent, no sound and NO crash (ship sound-safe). `prefers-reduced-motion` disables the animation.
      Files: `app/(site)/musafir-cafe/components/NoteModal.tsx` (+ a small `useMusafirSound` hook, inline or local)
      Verify: Phase 7 build + lint.

## Phase 6 — Fonts/CSS/a11y/reduced-motion stylesheet

- [ ] 19. Create the page-scoped stylesheet. All rules nested under `.musafir-wall-root`: font-family maps (`mz-font-*` → `--mz-*`, `cursive` fallback last), `--mz-note-w`/`--mz-note-h` bound to the logical constants (photo notes 210), paper gradients + texture, layered shadows, curled corner, adhesive strip, pins/tape, ink colors, `.mz-note--photo` taller box, backdrop layers (wood/mesh/beam/floor/light/vignette) at their z-bands, `.is-lifted`/`:focus-visible`, custom scrollbar, `.mz-note--new` glow, `overflow-wrap:anywhere` on text. One `@media (prefers-reduced-motion: reduce)` block disabling first-load sweep, fairy-light twinkle, hover/tap lift+rotate, slap bounce, and new-note glow (static highlight) while keeping scroll/drag.
      Files: `app/(site)/musafir-cafe/musafir-cafe.css`
      Verify: Phase 7 build + lint.

## Phase 7 — Env, SETUP, and verification gates

- [ ] 20. Append the `PROMISE_WALL_DB_URL` section to `.env.example` (append-only; do not touch existing values) and write `SETUP.md` listing: the new env var (separate DB isolated from main), that the schema's declared indexes ARE the migration (built on first connect, no migration-file system), that images reuse the existing Cloudinary env, folder `musafir-cafe`, and the API endpoint groups.
      Files: `.env.example`, `app/(site)/musafir-cafe/SETUP.md`
      Verify: Phase 7 gates below.

- [ ] 21. Run verification gates. Write a tiny throwaway `node` script to sanity-check the pure functions: `lib/notePlacement.ts` (35% cap, 60% union with the three-disjoint-20% case rejected, the exactly-40-cells boundary passes, `rotatedAABB` 0°/6°, determinism) and `lib/profanity.ts` (clean/dirty whole-word/Scunthorpe/leetspeak). Record results in `.agents/tasks/musafir-cafe/verification.md`, then DELETE the throwaway script. Then run `npm run build` and `npm run lint`; fix any failures; re-run until both pass. Record final build+lint outcomes in `verification.md`.
      Files: `.agents/tasks/musafir-cafe/verification.md` (temporary node script created and deleted)
      Verify: `npm run build` succeeds AND `npm run lint` reports no errors; `verification.md` records the placement/profanity sanity-check results and the build/lint outcomes.
      NO git commits — leave all files changed in the working tree.
