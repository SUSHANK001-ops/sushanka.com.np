'use client'
import React from 'react'
import Image from 'next/image'
import { BookOpen, BookMarked, CheckCircle2, Star, ArrowUpRight } from 'lucide-react'
import type { Book, BookStatus, BooksContent } from '@/lib/notion'
import { useGsapReveal } from '../../ui/useGsapReveal'

/* ------------------------------------------------------------------ */
/*  Per-status display labels.                                         */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: 'Reading',
  read: 'Read',
  want: 'Want to read',
  other: 'Shelved',
}

/** Two-letter initials from a title, for the cover placeholder. */
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/* ------------------------------------------------------------------ */
/*  Cover — next/image when present, styled placeholder otherwise.     */
/* ------------------------------------------------------------------ */

function Cover({ book }: { book: Book }) {
  if (book.cover) {
    return (
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
        <Image
          src={book.cover}
          alt={`Cover of ${book.title}`}
          fill
          sizes="48px"
          className="object-cover"
        />
      </div>
    )
  }
  return (
    <div
      aria-hidden
      className="flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-border bg-surface text-muted"
    >
      <BookOpen size={14} className="mb-0.5" />
      <span className="font-mono text-[0.6rem] tracking-wide">{initials(book.title)}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Book card.                                                         */
/* ------------------------------------------------------------------ */

function BookCard({ book }: { book: Book }) {
  const label = STATUS_LABEL[book.status]

  const inner = (
    <>
      <Cover book={book} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-foreground">{book.title}</h3>
        {book.author && (
          <p className="mt-0.5 truncate text-sm text-muted">{book.author}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-muted">
            {label}
          </span>
          {book.rating && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Star size={12} className="text-accent" aria-hidden />
              {book.rating}
            </span>
          )}
        </div>
      </div>
      {book.url && (
        <ArrowUpRight
          size={16}
          aria-hidden
          className="shrink-0 text-muted transition-colors group-hover:text-accent"
        />
      )}
    </>
  )

  if (book.url) {
    return (
      <a
        href={book.url}
        target="_blank"
        rel="noopener noreferrer"
        data-click-sound
        aria-label={`${book.title}${book.author ? ` by ${book.author}` : ''} — ${label}, open in Notion`}
        className="ed-card group flex items-start gap-3 transition hover:-translate-y-0.5"
      >
        {inner}
      </a>
    )
  }

  return (
    <article className="ed-card group flex items-start gap-3">
      {inner}
    </article>
  )
}

/* ------------------------------------------------------------------ */
/*  A titled section with a grid of book cards.                        */
/* ------------------------------------------------------------------ */

function BookSection({
  title,
  icon: Icon,
  books,
}: {
  title: string
  icon: typeof BookOpen
  books: Book[]
}) {
  const gridRef = useGsapReveal<HTMLDivElement>({ stagger: 0.08 })
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-center gap-2">
        <Icon size={18} className="text-accent" />
        <h2 className="serif-title serif-section !mb-0">{title}</h2>
      </div>
      <div ref={gridRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Main view.                                                         */
/* ------------------------------------------------------------------ */

const BooksView = ({ content }: { content: BooksContent }) => {
  const { reading, read, want } = content

  return (
    <>
      {reading.length > 0 && (
        <BookSection title="Currently reading" icon={BookOpen} books={reading} />
      )}

      {want && want.length > 0 && (
        <BookSection title="Want to read" icon={BookMarked} books={want} />
      )}

      {read.length > 0 && (
        <BookSection title="Read" icon={CheckCircle2} books={read} />
      )}

      {content.lastEdited && (
        <p className="mt-12 border-t border-border pt-6 text-xs text-muted">
          Last synced from Notion:{' '}
          {new Date(content.lastEdited).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
    </>
  )
}

export default BooksView
