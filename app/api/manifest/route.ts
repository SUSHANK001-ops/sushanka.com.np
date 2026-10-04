import { NextResponse } from 'next/server'
import { getManifestContent } from '@/lib/notion'

/**
 * ============================================================================
 *  Manifest content — reads the Notion page and returns parsed JSON.
 * ============================================================================
 *  Returns { configured: false } until NOTION_TOKEN + NOTION_MANIFEST_PAGE_ID
 *  are set (see lib/notion.ts for setup). Cached for 5 minutes so we don't hit
 *  the Notion API on every request.
 * ============================================================================
 */

export const revalidate = 300 // refresh at most every 5 minutes

export async function GET() {
  try {
    const content = await getManifestContent()
    return NextResponse.json(content)
  } catch (error) {
    console.error('Manifest route error:', error)
    return NextResponse.json({ configured: false, intro: [], todos: [], goals: [] })
  }
}
