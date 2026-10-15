# Musafir Cafe Promise Wall — Verification Log

## FEAT-001 — Foundation (DB connection, model, placement, profanity, types)

### Throwaway node sanity-check (tmp-feat001-check.mjs, created, run, deleted)

Ran under Node v24 (native TypeScript import). Results:

- PASS: `rotatedAABB(160,160,0)` is identity.
- PASS: `rotatedAABB(160,160,6)` grows ~10% (measured 9.91%).
- PASS: `noteBox` height flag (`false -> NOTE_H=160`, `true -> PHOTO_NOTE_H=210`).
- PASS: `coveredFraction` with exactly 40 covered cells returns 0.40 and is NOT rejected (`<= 0.40`, boundary passes).
- PASS: a 45-wide higher-z cover yields `> 0.40` (in the rejected region).
- PASS: three disjoint 20% overlaps cumulatively cover 60% (0.60) — correctly REJECTED by rule (b), proving the cumulative check is not inferred from the per-note 35% cap.
- PASS: `placeNote` output honors the 35% per-note cap against all existing notes.
- PASS: `placeNote` output honors the 60% cumulative-visibility rule.
- PASS: `placeNote` is deterministic for identical `(existing, wall, orientation, seed)` inputs.
- PASS: `isClean(null)`, `isClean("")`, `isClean("   ")` all return `true`.
- PASS: `isClean("hello world")` true; `isClean("scunthorpe")` true; `isClean("class assassin")` true (Scunthorpe-type substrings not flagged).
- PASS: `isClean("fuck")` false (blocked whole word).
- PASS: `isClean("f u c k that")` true (spaced letters are not a single token).
- PASS: `isClean("fuuuuck")` true and `isClean("shiiit")` true — runs > 2 collapse to 2 (`fuuck`/`shiit`), which are not the one-letter BLOCKED entries; conservative false-negative by design.
- PASS: leetspeak flagged — `sh1t` (1->i), `@sshole` (@->a), `$hit` ($->s) all return false.

Outcome: ALL PASSED. Script deleted after run.

### Build + lint gates

- `npm run build`: PASS (exit 0). "Compiled successfully", "Running TypeScript" passed, 33/33 static pages generated. The Notion/Umami fetch messages during static generation are pre-existing runtime logs for unrelated routes, not build failures. TypeScript compilation of the five FEAT-001 files succeeded.
- Targeted eslint over the five FEAT-001 files (`lib/notePlacement.ts`, `lib/profanity.ts`, `lib/promiseWallDb.ts`, `model/promiseNoteModel.ts`, `app/(site)/musafir-cafe/types.ts`): PASS (exit 0, no warnings/errors).
- `npm run lint` (whole repo): FAILS with 15 errors, all in PRE-EXISTING, untouched files (`app/(site)/guestbook/ui.tsx`, `app/ui/Navbar.tsx`, `app/ui/delight/AnimatedAvatar.tsx`, `app/api/guestbook/[id]/like/route.ts`, `app/api/admin/guestbook/[id]/route.ts`). Confirmed byte-identical to `origin/main` via `git diff --stat origin/main` (empty). These errors predate FEAT-001 and are independent of it; FEAT-001 introduces zero lint errors.

### Notes for later FEATs

The repo-wide `npm run lint` gate is currently red due to the pre-existing errors above. Any FEAT whose acceptance requires a green whole-repo `npm run lint` will need those pre-existing issues addressed separately (out of FEAT-001 scope).

## FEAT-002 — REST contract (upload, notes GET+POST, DELETE, report)

Files added:
- `app/api/musafir-cafe/upload/route.ts`
- `app/api/musafir-cafe/notes/route.ts` (GET + POST)
- `app/api/musafir-cafe/notes/[id]/route.ts` (DELETE)
- `app/api/musafir-cafe/notes/[id]/report/route.ts` (POST)

### Build + lint gates

- `npm run build`: PASS (exit 0). "Compiled successfully", TypeScript check passed, 33/33 pages. All four new routes appear in the route table as dynamic functions — `ƒ /api/musafir-cafe/notes`, `ƒ /api/musafir-cafe/notes/[id]`, `ƒ /api/musafir-cafe/notes/[id]/report`, `ƒ /api/musafir-cafe/upload` — confirming they import cleanly with no DB connection opened at import time (PROMISE_WALL_DB_URL may be unset; the wall connection only resolves at request time via `getPromiseNoteModel()`). The Notion/Umami fetch messages during static generation are pre-existing runtime logs for unrelated routes, not build failures.
- Targeted eslint over the four FEAT-002 route files: PASS (exit 0, no warnings/errors).
- `npm run lint` (whole repo): still FAILS with the same 15 PRE-EXISTING errors in untouched files (guestbook/ui.tsx, Navbar.tsx, delight/AnimatedAvatar.tsx, api/guestbook/[id]/like/route.ts, api/admin/guestbook/[id]/route.ts). None of the four new files appear in the lint output. FEAT-002 introduces zero new lint errors.

### Baked-in design decisions verified in code

- MEDIUM fix 1 (POST): the single projection `'pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at'` feeds BOTH placement passes; `rotation` and `created_at` are present.
- MEDIUM fix 1 (report): `rateLimit('musafir-report', `${uid}:${id}`, 1, 86400)` is consulted BEFORE any `$inc`; denied → `{ success: true }` with no re-increment.
- NIT #7: no redundant `findById` in report; `findOneAndUpdate` result is the 404 guard; auto-hide at `report_count >= 5 && status === 'visible'`.
- NIT #8: POST only accepts Cloudinary URLs via `^https:\/\/res\.cloudinary\.com\/`; blob:/data: preview URLs rejected.
- sanitize-COPY: the guestbook's identical sanitize logic (strip `[\u0000-\u001f\u007f]`, collapse whitespace, trim) is reproduced inline in notes/route.ts; the guestbook's private function is never imported.
- `if (!uid)` guard precedes rate-limit/create in POST and ownership compare in DELETE and report.
- GET builds `PublicNote` explicitly (never spreads the raw doc), never returns `user_id`/`*_public_id`, includes boolean `mine`, and uses a true keyset on (created_at,_id) with malformed-cursor → first page.

## FEAT-003 — Client experience (fonts, page, wall, components, CSS)

Files added:
- `app/(site)/musafir-cafe/fonts.ts` (Caveat/Kalam/Patrick_Hand/Reenie_Beanie via next/font/google, page-local `--mz-*` vars, `display:'swap'`)
- `app/(site)/musafir-cafe/page.tsx` (server component: metadata, Google-provider detection, `.musafir-wall-root` wrapper with all four font variables, renders MusafirWall)
- `app/(site)/musafir-cafe/MusafirWall.tsx` (`'use client'` orchestrator)
- `app/(site)/musafir-cafe/components/{WallBackdrop,WallProps,StickyNote,LeaveNoteButton,RulesMailbox,DrawCanvas,Composer,NoteModal}.tsx`
- `app/(site)/musafir-cafe/components/useMusafirSound.ts`
- `app/(site)/musafir-cafe/musafir-cafe.css`

### Build + lint gates

- `npm run build`: PASS (exit 0). "Compiled successfully in 27.7s", "Running TypeScript" passed, 34/34 static pages generated. `/musafir-cafe` appears in the route table as a static page (○) and all four API routes remain dynamic (ƒ). The Notion/Umami fetch messages during static generation are pre-existing runtime logs for unrelated routes (`/books`, `/manifest`, `/api/*`), not build failures.
  - NOTE: the first build attempt failed with "Failed to fetch `<font>` from Google Fonts" for EVERY next/font/google face — including the pre-existing root-layout fonts (Caveat/Fraunces/Geist/JetBrains/Noto), not just the new ones. This was a transient outbound-network failure to fonts.googleapis.com at build time (next/font/google self-hosts by downloading at build). Connectivity recovered (HTTP 200 to the css2 endpoint) and the immediate re-run compiled cleanly. The approach (next/font/google, CSP-safe per context) is unchanged and correct.
- Targeted eslint over all new `app/(site)/musafir-cafe/**/*.{ts,tsx}` files: PASS (exit 0, no warnings/errors). Every plain `<img>` (StickyNote photo+drawing, NoteModal photo+drawing, Composer photo preview) carries `// eslint-disable-next-line @next/next/no-img-element`.
- `npm run lint` (whole repo): still 15 PRE-EXISTING errors in untouched files only (guestbook/ui.tsx, Navbar.tsx, delight/AnimatedAvatar.tsx, api/guestbook/[id]/like/route.ts, api/admin/guestbook/[id]/route.ts); zero in FEAT-003 files. FEAT-003 introduces zero new lint errors.
  - To stay clean under the repo's `react-hooks/set-state-in-effect` rule, the portaled modals/composer use a `typeof document !== 'undefined'` SSR guard instead of the guestbook's `useEffect(() => setMounted(true))` pattern (that pattern is itself one of the pre-existing lint errors in ui.tsx).

### Baked-in design decisions verified in code

- MEDIUM fix 2: `StickyNote` applies `.mz-note--photo` (taller box) under EXACTLY `note.photo_url != null`; CSS binds `.mz-note--photo { height: 210px }` so render height equals placement height.
- MEDIUM fix 4: `MusafirWall` renders the desktop canvas at logical `H_WALL_HEIGHT=900` scaled to the viewport (`scale = clientHeight / H_WALL_HEIGHT`), mirroring the mobile whole-canvas scale (`clientWidth / V_WALL_WIDTH`), never raw 100vh.
- NIT #8: Composer submit uploads any pending drawing/photo FIRST and POSTs only the Cloudinary `drawing_url`/`photo_url` (+ public ids); the local `*DataUrl` previews are never sent.
- Fonts via next/font/google only — no Google Fonts `<link>`/`@import`.
- Note text renders as plain `<p>{text}</p>` (StickyNote, NoteModal) — never dangerouslySetInnerHTML.
- Layout reads `pos_x/pos_y` on desktop (`matchMedia('(min-width:1024px)')`) and `pos_x_v/pos_y_v` on mobile; positions are never recomputed client-side.
- Viewport-rect cull (rAF-throttled, one-screen overscan) drives which notes AND prop clusters mount; visible notes are sorted by the `(z_index, created_at, _id)` comparator ascending before mapping, keyed by note id.
- Sound: `useMusafirSound` gates `useSound` by `useSoundFx().enabled && !pageMuted`; absent paper-lift.mp3/paper-stick.mp3 → no sound, no crash (play wrapped in try/catch and gated).
- One `@media (prefers-reduced-motion: reduce)` block disables the first-load sweep, fairy-light twinkle, hover/tap lift+rotate, slap bounce, and new-note glow (static highlight) while keeping scroll/drag.
- All CSS nested under `.musafir-wall-root`; `--mz-note-w/--mz-note-h` bound to the logical constants (photo 210); `overflow-wrap: anywhere` on note text.
