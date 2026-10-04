/**
 * ============================================================================
 *  Notion content fetcher — powers the /manifest page.
 * ============================================================================
 *
 *  Reads the child blocks of a single Notion page and parses them into a tidy,
 *  render-friendly shape. No Notion SDK needed — we call the public REST API
 *  with fetch (same lightweight approach as the Spotify route).
 *
 *  SETUP (one-time):
 *  1. Create an internal integration at https://www.notion.so/my-integrations
 *     and copy its secret (starts with `ntn_` or `secret_`).
 *  2. Open your Manifest page in Notion → ••• → Connections → add the
 *     integration so it has read access.
 *  3. Copy the page ID from the URL (the 32-char hex after the title slug).
 *  4. Add to your environment (.env):
 *        NOTION_TOKEN="ntn_..."
 *        NOTION_MANIFEST_PAGE_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 *  Until those are set, the API route reports { configured: false } and the
 *  page shows a graceful fallback.
 * ============================================================================
 */

const NOTION_VERSION = '2022-06-28'
const API_BASE = 'https://api.notion.com/v1'

/* ------------------------------------------------------------------ */
/*  Parsed content shapes                                              */
/* ------------------------------------------------------------------ */

export interface RichSpan {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
}

/** A single to-do / checklist item (e.g. a manifest affirmation). */
export interface TodoItem {
  id: string
  spans: RichSpan[]
  checked: boolean
}

/** A learning goal: a toggle (or heading) with optional child text. */
export interface GoalItem {
  id: string
  title: string
  description: string
}

export interface ManifestContent {
  configured: boolean
  /** Intro paragraph(s) shown under the page title. */
  intro: RichSpan[][]
  /** Checklist affirmations ("I do the work even when I do not feel like it"). */
  todos: TodoItem[]
  /** Learning goals rendered as cards. */
  goals: GoalItem[]
  /** ISO timestamp of the page's last edit, for a "Last updated" note. */
  lastEdited?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseRich(rich: any[]): RichSpan[] {
  if (!Array.isArray(rich)) return []
  return rich.map((r) => ({
    text: r?.plain_text ?? '',
    bold: Boolean(r?.annotations?.bold),
    italic: Boolean(r?.annotations?.italic),
    code: Boolean(r?.annotations?.code),
    href: r?.href ?? undefined,
  }))
}

function spansToPlain(spans: RichSpan[]): string {
  return spans.map((s) => s.text).join('')
}

/** Fetch the direct children of a Notion block/page (one page of results). */
async function fetchChildren(
  blockId: string,
  token: string,
  startCursor?: string,
): Promise<any[]> {
  const url = new URL(`${API_BASE}/blocks/${blockId}/children`)
  url.searchParams.set('page_size', '100')
  if (startCursor) url.searchParams.set('start_cursor', startCursor)

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Notion children ${res.status}`)
  const data = await res.json()
  const results: any[] = data?.results ?? []
  if (data?.has_more && data?.next_cursor) {
    results.push(...(await fetchChildren(blockId, token, data.next_cursor)))
  }
  return results
}

/**
 * Expand synced blocks in place. A synced block is either:
 *  - the "original" (its own `rich_text`-free container; children live under it), or
 *  - a "reference" copy with `synced_from.block_id` pointing at the original.
 * Either way the real content is the children of the resolved block id, so we
 * fetch them and splice them into the list. Other block types pass through.
 */
async function expandSynced(blocks: any[], token: string): Promise<any[]> {
  const out: any[] = []
  for (const block of blocks) {
    if (block?.type === 'synced_block') {
      // Reference copies point elsewhere; originals hold their own children.
      const sourceId = block.synced_block?.synced_from?.block_id ?? block.id
      try {
        const children = await fetchChildren(sourceId, token)
        // Children may themselves contain nested synced blocks.
        out.push(...(await expandSynced(children, token)))
      } catch (err) {
        console.error('Notion synced-block expand error:', err)
      }
      continue
    }
    out.push(block)
  }
  return out
}

/** Fetch page metadata (used for the last-edited timestamp). */
async function fetchPageMeta(pageId: string, token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${API_BASE}/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
      },
      cache: 'no-store',
    })
    if (!res.ok) return undefined
    const data = await res.json()
    return data?.last_edited_time ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Read the Manifest page and parse its blocks into {@link ManifestContent}.
 *
 * Mapping (from the Notion page layout):
 *  - `to_do` blocks            → checklist affirmations (`todos`)
 *  - `toggle` blocks           → learning goals; the toggle title is the goal
 *                                title, its first text child is the description
 *  - `heading_1/2/3` blocks    → treated as learning goals when they carry a
 *                                following paragraph (fallback for non-toggle layouts)
 *  - leading `paragraph`/`quote` blocks (before any to_do) → intro text
 */
export async function getManifestContent(): Promise<ManifestContent> {
  const { NOTION_TOKEN, NOTION_MANIFEST_PAGE_ID } = process.env
  const empty: ManifestContent = { configured: false, intro: [], todos: [], goals: [] }

  if (!NOTION_TOKEN || !NOTION_MANIFEST_PAGE_ID) return empty
  if (NOTION_TOKEN.length < 20) return empty

  let blocks: any[]
  try {
    const top = await fetchChildren(NOTION_MANIFEST_PAGE_ID, NOTION_TOKEN)
    // Flatten any synced blocks so their mirrored content is parsed too.
    blocks = await expandSynced(top, NOTION_TOKEN)
  } catch (err) {
    console.error('Notion manifest fetch error:', err)
    return { ...empty, configured: true }
  }

  const intro: RichSpan[][] = []
  const todos: TodoItem[] = []
  const goals: GoalItem[] = []
  let seenTodo = false
  let seenGoalHeading = false

  /**
   * Layout (from the Notion "Learning Hub" source block):
   *   heading_2  "✨ Manifest"            → section header (skipped)
   *   to_do × N                           → manifest affirmations
   *   heading_2  "My Learning Goal"       → marks the start of goals (skipped)
   *   heading_3  "Learn Go…"              → goal title
   *   paragraph  "Develop scalable…"      → that goal's description
   *   …repeats…
   */
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const type: string = block?.type
    if (!type) continue

    if (type === 'to_do') {
      seenTodo = true
      const spans = parseRich(block.to_do?.rich_text ?? [])
      if (spans.length === 0) continue
      todos.push({ id: block.id, spans, checked: Boolean(block.to_do?.checked) })
      continue
    }

    // A heading_3 is a learning-goal title. Its description is the immediately
    // following paragraph sibling (consumed here so it isn't parsed twice).
    if (type === 'heading_3') {
      seenGoalHeading = true
      const title = spansToPlain(parseRich(block.heading_3?.rich_text ?? [])).trim()
      if (!title) continue
      let description = ''
      const next = blocks[i + 1]
      if (next?.type === 'paragraph') {
        description = spansToPlain(parseRich(next.paragraph?.rich_text ?? [])).trim()
        i++ // skip the consumed description paragraph
      }
      goals.push({ id: block.id, title, description })
      continue
    }

    // A plain `toggle` is also treated as a goal (title + first child text),
    // so the page still works if you switch the layout to toggles.
    if (type === 'toggle') {
      seenGoalHeading = true
      const title = spansToPlain(parseRich(block.toggle?.rich_text ?? [])).trim()
      if (!title) continue
      let description = ''
      if (block.has_children) {
        try {
          const kids = await fetchChildren(block.id, NOTION_TOKEN)
          const firstText = kids.find(
            (k) => k.type === 'paragraph' || k.type === 'bulleted_list_item',
          )
          if (firstText) {
            const fk = firstText.type
            description = spansToPlain(parseRich(firstText[fk]?.rich_text ?? [])).trim()
          }
        } catch {
          /* non-fatal — show the goal without a description */
        }
      }
      goals.push({ id: block.id, title, description })
      continue
    }

    // heading_1 / heading_2 are section headers ("Manifest", "My Learning
    // Goal") — skip them so they don't leak into the content.
    if (type === 'heading_1' || type === 'heading_2') continue

    // Leading paragraphs/quotes (before any to-do and before goal headings)
    // are intro copy shown under the page title.
    if ((type === 'paragraph' || type === 'quote') && !seenTodo && !seenGoalHeading) {
      const spans = parseRich(block[type]?.rich_text ?? [])
      if (spansToPlain(spans).trim()) intro.push(spans)
      continue
    }
  }

  const lastEdited = await fetchPageMeta(NOTION_MANIFEST_PAGE_ID, NOTION_TOKEN)

  return { configured: true, intro, todos, goals, lastEdited }
}
