import React from 'react'
import type { Metadata } from 'next'
import { getBooks } from '@/lib/notion'
import BooksView from './BooksView'

export const metadata: Metadata = {
  title: 'Books · Sushanka Lamichhane',
  description:
    'What I am reading and what I have read — a quiet way to live many lives and collect ideas.',
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
            The shelf is empty right now — check back soon.
          </p>
        </div>
      )}
    </div>
  )
}
