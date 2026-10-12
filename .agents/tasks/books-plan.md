# Implementation Plan — Books page (Notion-synced reading list)

Build a new `/books` page for the Next.js (App Router) portfolio that reads the owner's
reading list from a Notion **database** and renders it in the site's existing editorial UI.
Mirror the `/manifest` feature end-to-end (lib fetcher → API route → server page → client view),
plus two nav/footer edits and two env-file edits.

## Design decisions (made during exploration, grounded in the codebase)

- **No test framework exists.** `package.json` scripts are `dev`, `build`, `lint`, `start`.
  Verification throughout is `npm run lint` (ESLint, `eslint-config-next`) and `npm run build`
  (`next build`, which type-checks + compiles). There are no unit tests to run.
- **Reuse, don't duplicate, `lib/notion.ts` helpers.** `NOTION_VERSION = '2022-06-28'`,
  `API_BASE = 'https://api.notion.com/v1'`, and `parseRich()` already exist. The new `getBooks()`
  lives in the same file so these are in scope directly — do NOT redeclare them. Add a small
  `databaseQuery()` helper that paginates via `has_more`/`next_cursor`, mirroring `fetchChildren()`
  (which uses the same loop against the blocks endpoint). Query endpoint is a **POST** to
  `/databases/{id}/query` with a JSON body `{ page_size: 100, start_cursor? }` and the same auth +
  `Notion-Version` headers, plus `Content-Type: application/json`.
- **Graceful fallback mirrors `getManifestContent()`.** Return
  `{ configured: false, reading: [], read: [] }` when `NOTION_TOKEN` or `NOTION_BOOKS_DB_ID` is
  missing, or when `NOTION_TOKEN.length < 20` (same guard the manifest uses). On a fetch error,
  return `{ ...empty, configured: true }` so the page shows "nothing yet" rather than the
  not-connected copy — matching the manifest's error branch.
- **Covers: placeholder-first, next/image when present.** Notion cover URLs come from hosts NOT in
  `next.config.ts` `images.remotePatterns` and NOT in the CSP `img-src` allowlist in
  `next.config.ts`. Signed Notion file URLs (`...amazonaws.com`) also expire, which is fragile under
  5-minute ISR. **Decision:** the card renders a styled placeholder (title initials over `bg-surface`,
  with a `BookOpen` lucide icon) as the reliable default, and renders a `next/image` cover only when a
  cover URL is present. To let present covers actually load, add Notion image hosts to BOTH
  `images.remotePatterns` AND the CSP `img-src` directive. External covers (Open Library / Goodreads
  style public URLs) can't be host-allowlisted exhaustively, so the placeholder is what guarantees the
  "looks good without a cover" requirement; covers are best-effort enrichment. This keeps the page
  correct and buildable regardless of what Notion returns.
- **Defensive parser (property names unknown at build time).** Match by property *type* and
  name regex, never by hardcoded names. Normalize status to a small union. Details in item 1.
- **This task does NOT decompose into separable features.** Everything hangs off the single
  `BooksContent`/`Book` shape defined in `lib/notion.ts`; the route, page, and view are a straight
  dependency chain, and the nav/footer/env edits are trivial. Splitting into FEATs would invent
  artificial seams, so the plan stays a single ordered list for the existing implement/review loop.
  The workflow tail is NOT being restructured.

## Typed shapes (add to `lib/notion.ts`, exported)

```ts
export type BookStatus = 'reading' | 'read' | 'want' | 'other'

export interface Book {
  id: string
  title: string
  author?: string
  status: BookStatus
  url?: string      // result.url — the Notion page, opened in a new tab
  cover?: string    // page cover (external.url | file.url) or a cover/image property
  rating?: string   // normalized to a short display string (e.g. "★★★★☆" or "4")
}

export interface BooksContent {
  configured: boolean
  reading: Book[]
  read: Book[]
  want?: Book[]
  lastEdited?: string  // most-recent result.last_edited_time, as a "last synced" hint
}
```

## Items

- [ ] 1. Add `getBooks()` + its helpers and types to `lib/notion.ts`.
      Add the exported `BookStatus`, `Book`, `BooksContent` types (shapes above). Add a private
      `databaseQuery(dbId, token, startCursor?)` that POSTs to
      `` `${API_BASE}/databases/${dbId}/query` `` with headers
      `{ Authorization: Bearer <token>, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }`,
      body `JSON.stringify({ page_size: 100, ...(startCursor ? { start_cursor: startCursor } : {}) })`,
      `cache: 'no-store'`, throwing on `!res.ok`, and recursing on `has_more`/`next_cursor` to collect
      all result page objects (mirror `fetchChildren`). Add a private `parseBook(result)` that reads
      `result.properties` defensively:
      - **Title**: the property with `type === 'title'` (find by type, not name); value is
        `spansToPlain(parseRich(prop.title))`. Skip the result if the title is empty.
      - **Status**: prefer a property whose `type` is `'status'` or `'select'` AND whose name matches
        `/status/i`; else fall back to the first `'status'`/`'select'` property. Read
        `prop.status?.name ?? prop.select?.name`. Normalize case-insensitively on substrings:
        `currently`/`reading` → `reading`; `want`/`to read`/`to-read`/`wishlist`/`backlog` → `want`
        (test `want` BEFORE `read` so "want to read" isn't caught by the read branch);
        `read`/`done`/`finished`/`complete` → `read`; else `other`.
      - **Author** (optional): a `rich_text`/`text`-typed property whose name matches `/author/i`;
        value via `spansToPlain(parseRich(...))`, trimmed; omit if empty.
      - **Rating** (optional): a `number`-typed property matching `/rating|stars?/i` (stringify the
        number), else a `select`/`rich_text` property matching the same regex whose text contains star
        glyphs; omit if absent.
      - **Cover** (optional): `result.cover?.external?.url ?? result.cover?.file?.url`; else a
        `files`/`url`-typed property matching `/cover|image/i` (`prop.url` or
        `prop.files?.[0]?.external?.url ?? prop.files?.[0]?.file?.url`); omit if none.
      - **url**: `result.url`. **id**: `result.id`.
      Then `getBooks()` reads `process.env.NOTION_TOKEN` + `process.env.NOTION_BOOKS_DB_ID`, applies the
      same guards as `getManifestContent` (missing / `length < 20` → `{ configured:false, reading:[], read:[] }`),
      queries the DB inside try/catch (error → `{ configured:true, reading:[], read:[] }`), maps results
      through `parseBook`, buckets into `reading` / `read` / `want` (drop `other` from the three buckets,
      or fold into `read` — bucket them so each list only holds its own status; `other` is excluded),
      sets `lastEdited` to the max `last_edited_time` across results, and returns `BooksContent` with
      `configured: true`. Reuse existing `parseRich` and `spansToPlain`; do not redeclare `NOTION_VERSION`/`API_BASE`.
      Files: `lib/notion.ts`
      Verify: `npm run lint` passes with no new errors, and `npm run build` type-checks the new exports
      (no TS errors referencing `lib/notion.ts`).

- [ ] 2. Create the Books API route mirroring the manifest route.
      `export const revalidate = 300`; `GET` calls `getBooks()` inside try/catch and returns
      `NextResponse.json(content)`; the catch returns a safe empty `BooksContent`
      `{ configured: false, reading: [], read: [] }` and logs via `console.error`.
      Files (create): `app/api/books/route.ts`
      Verify: `npm run build` compiles the route (appears in the route manifest as `/api/books`);
      `npm run lint` clean.

- [ ] 3. Create the Books server page mirroring `manifest/page.tsx`.
      Export `metadata` (title `'Books · Sushanka Lamichhane'`, a fitting reading-list description),
      `export const revalidate = 300`, `await getBooks()`. Compute
      `hasContent = reading.length || read.length || (want?.length ?? 0)`. Wrapper
      `className="editorial-page pt-32 pb-16 md:pt-36"`. Render eyebrow
      `<p className="eyebrow eyebrow-dot mb-3">Shelf life</p>`, `<h1 className="display-serif text-4xl text-foreground md:text-5xl">Books</h1>`,
      and the punch-line tagline below the title in `text-muted` editorial voice (a restrained one-liner
      about books being a quiet way to live many lives / collect ideas — concise, not cringey, matching
      the manifest copy's tone). When `hasContent`, render `<BooksView content={content} />`; otherwise the
      dashed-border fallback (`rounded-xl border border-dashed border-border p-8 text-center`) whose
      not-configured branch mentions setting `NOTION_TOKEN` and `NOTION_BOOKS_DB_ID`, mirroring the
      manifest fallback exactly.
      Files (create): `app/(site)/books/page.tsx`
      Verify: `npm run build` compiles `/books` as a route; `npm run lint` clean. Depends on items 1 & 3b.

- [ ] 3b. Create the `BooksView` client component.
      `'use client'`; import `useGsapReveal` from `'../../ui/useGsapReveal'` and `type { Book, BooksContent }`
      from `'@/lib/notion'`; import `BookOpen`, `Star` (or `ArrowUpRight`) from `lucide-react` and `Image`
      from `next/image`. Render up to three sections in order — **Currently reading** (`reading`),
      **Want to read** (`want`, only when non-empty), **Read** (`read`) — each a responsive grid
      (`grid grid-cols-1 gap-4 sm:grid-cols-2`) attached to a `useGsapReveal({ stagger: 0.08 })` ref, each
      preceded by a section heading in the manifest's `serif-title serif-section` style with a lucide icon.
      Each card is an `<a href={book.url} target="_blank" rel="noopener noreferrer" aria-label={...}>`
      using the `ed-card` class (matches ProjectCard/CertCard hover) with a hover lift
      (`transition hover:-translate-y-0.5`) — when `book.url` is absent, render a non-link `<article>`
      instead. Card contents: a cover block that renders `next/image` (fixed box, `object-cover`,
      descriptive `alt`) when `book.cover` is set, else a styled placeholder (`bg-surface` box with the
      title's initials and a `BookOpen` icon); the title (`font-semibold text-foreground`); author
      (`text-sm text-muted`) when present; a small status pill — `rounded-full border border-border px-2.5
      py-0.5 font-mono text-xs text-muted`, label `'Reading' | 'Want to read' | 'Read'` from `book.status`;
      and optional rating (small `text-muted` row). Accessibility: `alt` on covers, `aria-label` on each
      card link, section `<h2>` headings for hierarchy.
      Files (create): `app/(site)/books/BooksView.tsx`
      Verify: `npm run build` type-checks the component against the `BooksContent` shape; `npm run lint` clean.
      Depends on item 1 (types). Item 3 imports this; land 3b with/before 3.

- [ ] 4. Allow Notion cover hosts in `next.config.ts` (images + CSP).
      Add Notion image hosts to `images.remotePatterns`:
      `www.notion.so`, `s3.us-west-2.amazonaws.com`, and `prod-files-secure.s3.us-west-2.amazonaws.com`
      (hostname entries, `protocol: 'https'`). In the `csp` array's `img-src` directive, append the same
      hosts (space-separated) so covers aren't blocked by CSP. Leave all other directives untouched.
      Files: `next.config.ts`
      Verify: `npm run build` succeeds; manually confirm the `img-src` line now lists the Notion hosts.
      (Independent of the view; needed only for covers to actually render.)

- [ ] 5. Add the Books link to the primary nav.
      In `app/ui/Navbar.tsx`, add `{ label: 'Books', href: '/books' }` to the `links` array in a sensible
      position (e.g. right after the `Blog` entry). One edit; the `links` array drives both desktop and
      mobile menus.
      Files: `app/ui/Navbar.tsx`
      Verify: `npm run lint` clean; `npm run build` succeeds; the nav renders a `/books` link
      (manually confirm in `npm run dev`).

- [ ] 6. Add the Books link to the footer.
      In `app/ui/Footer.tsx`, add `{ label: 'Books', href: '/books', icon: BookOpen }` to one of the
      `columns`. `BookOpen` is already imported. Column 2 currently uses `BookOpen` for its 'Blog' entry
      (`{ label: 'Blog', href: '/blog', icon: BookOpen }`) — to avoid a duplicate icon in the same column,
      place the new Books link in column 1 (which has About/Uses/Certifications/Manifest and no BookOpen),
      appending it there. Do NOT remove unrelated links.
      Files: `app/ui/Footer.tsx`
      Verify: `npm run lint` clean; `npm run build` succeeds; footer shows a Books link.

- [ ] 7. Add `NOTION_BOOKS_DB_ID` to `.env` (real value).
      Under the existing `# --- Notion (dynamic /manifest page) ---` block in `.env`, add a short comment
      and `NOTION_BOOKS_DB_ID="23c8a8721b6a816082a6f652f3651f78"` (the database id from the owner's books
      DB URL). Do NOT touch, print, or echo `NOTION_TOKEN`'s value — reference it by name only. Note: the
      owner must share the books database with the same Notion integration (DB → ••• → Connections) for
      queries to return data; call this out but it's a Notion-side action, not a code change.
      Files: `.env`
      Verify: `npm run dev` then load `/books` — the API returns real `configured: true` data once the DB
      is shared with the integration. (`.env` is gitignored via `.env*`, so it won't be committed.)

- [ ] 8. Add `NOTION_BOOKS_DB_ID` to `.env.example` (empty + comment).
      Under the existing Notion comment block in `.env.example`, add an explanatory comment mirroring that
      block's style (e.g. "The 32-char database ID from the Books database URL, before the `?v=`.") and
      `NOTION_BOOKS_DB_ID=""`. Keep placeholder empty; never put the real id here.
      Files: `.env.example`
      Verify: `npm run lint`/`npm run build` unaffected; file reads cleanly and mirrors the manifest entry.

## Final verification (run after all items)

- `npm run lint` — no new ESLint errors.
- `npm run build` — succeeds; route manifest includes `/books` and `/api/books`.
- `npm run dev`, visit `/books`:
  - With `.env` configured AND the DB shared with the integration: cards render in
    Reading / Want to read / Read sections, each card links out to Notion in a new tab, covers show when
    present and fall back to the initials/BookOpen placeholder otherwise.
  - Without configuration: the dashed-border fallback appears mentioning `NOTION_TOKEN` +
    `NOTION_BOOKS_DB_ID`.
  - Books link appears in both the navbar and the footer.

## Known gaps / assumptions

- Exact Notion property names/types are unknown; the parser is matched by type + name regex and is
  resilient to missing optional fields. If the owner's status values use wording outside the matched
  substrings, those books fall into `other` and are excluded from the three buckets — acceptable and
  non-breaking.
- Notion signed file-cover URLs expire; with 5-minute ISR a stale cover may 404 until the next revalidate.
  The placeholder covers this gracefully. External covers from arbitrary hosts won't load unless their
  host is in `remotePatterns`/CSP — again, the placeholder is the guaranteed-good path.
- The integration must be connected to the books database on the Notion side (item 7 note). That's a
  one-time manual step the owner performs; no code can do it.

## Verification (run after implementation)

Commands come from `package.json` (`lint` → `eslint`, `build` → `next build`; no test runner exists).

### `npm run lint`
- The four new/edited source files are clean: `npx eslint app/(site)/books/BooksView.tsx
  app/(site)/books/page.tsx app/api/books/route.ts lib/notion.ts` → **exit 0, no errors or warnings.**
- The full `npm run lint` reports 15 errors / 11 warnings, but every one is **pre-existing and
  unrelated** to this task: `guestbook/ui.tsx`, `guestbook/Guestbook.tsx`, `admin/*`,
  `api/guestbook/[id]/like`, `ui/Navbar.tsx` (an existing `setOpen` effect, not the line I added to the
  `links` array), and `ui/delight/AnimatedAvatar.tsx`. The `Footer.tsx` `Image`/`SpinBadge` unused-import
  warnings also predate this change (my edit only appended one link object). No new lint problems were
  introduced.

### `npm run build`  (`next build`, type-checks + compiles)
- **Succeeded, exit code 0.** `Finished TypeScript` with no errors; all 33 pages generated.
- Route manifest now lists **`ƒ /books`** and **`ƒ /api/books`**, mirroring `ƒ /manifest` and
  `ƒ /api/manifest` (dynamic / server-rendered on demand — identical to the manifest feature).
- During static generation the log shows `Notion books fetch error: ... DYNAMIC_SERVER_USAGE` for
  `/books` and `/api/books`. This is the **expected graceful-fallback path** and is exactly what the
  existing `/manifest` and `/api/manifest` routes do in the same build (the integration isn't shared
  with the database yet). The error is caught in `getBooks()` / the route's try/catch, logged, and a
  safe empty `BooksContent` is returned — the build does **not** fail and the page renders the
  not-connected/empty fallback instead of crashing. Live Notion data is not required to pass.

### Manual confirmation
- `app/ui/Navbar.tsx` `links` array now includes `{ label: 'Books', href: '/books' }` (after Blog);
  it drives both desktop and mobile menus.
- `app/ui/Footer.tsx` column 1 now includes `{ label: 'Books', href: '/books', icon: BookOpen }`
  (no duplicate BookOpen in that column; `BookOpen` was already imported). No links removed.
- `next.config.ts` `images.remotePatterns` and the CSP `img-src` directive both now list
  `www.notion.so`, `s3.us-west-2.amazonaws.com`, and
  `prod-files-secure.s3.us-west-2.amazonaws.com` so present covers can load; the placeholder covers
  the no-cover case.
- `.env` has the real `NOTION_BOOKS_DB_ID`; `.env.example` has an empty `NOTION_BOOKS_DB_ID=""` with a
  mirrored comment. `NOTION_TOKEN`'s value was never printed or echoed.

**Result: build passes, new routes compile, fallback renders gracefully without live Notion data.**
Working tree left with changes (not committed, per instructions).
