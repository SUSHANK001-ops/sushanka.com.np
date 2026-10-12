import { NextResponse } from 'next/server'
import { getBooks } from '@/lib/notion'

/**
 * ============================================================================
 *  Books content — reads the Notion reading-list database and returns JSON.
 * ============================================================================
 *  Returns { configured: false } until NOTION_TOKEN + NOTION_BOOKS_DB_ID are
 *  set (see lib/notion.ts for setup). Cached for 5 minutes so we don't hit the
 *  Notion API on every request.
 * ============================================================================
 */

export const revalidate = 300 // refresh at most every 5 minutes

export async function GET() {
  try {
    const content = await getBooks()
    return NextResponse.json(content)
  } catch (error) {
    console.error('Books route error:', error)
    return NextResponse.json({ configured: false, reading: [], read: [] })
  }
}
