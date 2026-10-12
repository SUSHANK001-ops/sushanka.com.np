import React from 'react'
import type { Metadata } from 'next'
import { getBooks } from '@/lib/notion'
import BooksView from './BooksView'

export const metadata: Metadata = {
  title: 'Books · Sushanka Lamichhane',
  description:
    'What I am reading and what I have read — a reading list synced from Notion. Books as a quiet way to live many lives and collect ideas.',
}

// Refresh at most every 5 minutes so Notion edits appear without a rebuild.
export const revalidate = 300

export default async function BooksPage() {
  const content = await getBooks()
  const hasContent =
    content.reading.length > 0 ||
    content.read.length > 0 ||
    (content.want?.length ?? 0) > 0

  return (
    <div className="editorial-page pt-32 pb-16 md:pt-36">
      <p className="eyebrow eyebrow-dot mb-3">Shelf life</p>
      <h1 className="display-serif text-4xl text-foreground md:text-5xl">Books</h1>
      <p className="mt-4 max-w-xl text-[0.975rem] leading-relaxed text-muted">
        A quiet way to live many lives and collect ideas. Here&apos;s what I&apos;m
        reading now and what has stayed with me.
      </p>

      {hasContent ? (
        <BooksView content={content} />
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted">
            {content.configured
              ? 'Nothing on the shelf yet — add some books to the Notion database.'
              : 'The reading list is not connected to Notion yet.'}
          </p>
          {!content.configured && (
            <p className="mt-2 font-mono text-[11px] text-muted/70">
              Set NOTION_TOKEN and NOTION_BOOKS_DB_ID to go live.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
