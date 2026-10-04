import React from 'react'
import type { Metadata } from 'next'
import { getManifestContent } from '@/lib/notion'
import ManifestView from './ManifestView'

export const metadata: Metadata = {
  title: 'Manifest · Sushanka Lamichhane',
  description:
    'A living bucket list of things I am working toward — goals, milestones, and dreams. Synced from Notion. Open to sponsors.',
}

// Refresh at most every 5 minutes so Notion edits appear without a rebuild.
export const revalidate = 300

export default async function ManifestPage() {
  const content = await getManifestContent()
  const hasContent =
    content.todos.length > 0 || content.goals.length > 0 || content.intro.length > 0

  return (
    <div className="editorial-page pt-32 pb-16 md:pt-36">
      <p className="eyebrow eyebrow-dot mb-3">Life bucket list</p>
      <h1 className="display-serif text-4xl text-foreground md:text-5xl">Manifest List</h1>
      <p className="mt-4 text-[0.975rem] leading-relaxed text-muted">
        A living list of things I&apos;m working toward — goals, milestones, and
        dreams. It syncs straight from my Notion, so only I check items off; it
        stays read-only here.
      </p>

      {hasContent ? (
        <ManifestView content={content} />
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted">
            {content.configured
              ? 'Nothing to show yet — add some items to the Notion page.'
              : 'Manifest is not connected to Notion yet.'}
          </p>
          {!content.configured && (
            <p className="mt-2 font-mono text-[11px] text-muted/70">
              Set NOTION_TOKEN and NOTION_MANIFEST_PAGE_ID to go live.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
