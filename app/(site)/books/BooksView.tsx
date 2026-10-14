'use client'
import React, { useState } from 'react'
import Image from 'next/image'
import { BookOpen, BookMarked, CheckCircle2 } from 'lucide-react'
import type { Book, BookStatus, BooksContent } from '@/lib/notion'
import { useGsapReveal } from '../../ui/useGsapReveal'

/* ------------------------------------------------------------------ */
/*  Per-status display labels (as requested):                          */
/*    read     -> "Read"                                               */
/*    reading  -> "In Progress"  (Notion "In progress")                */
/*    want     -> "Not started"  (Notion "Not started")                */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<BookStatus, string> = {
  read: 'Read',
  reading: 'In Progress',
  want: 'Not started',
  other: 'Shelved',
}

/** Two-letter initials from a title, for the cover placeholder. */
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Deterministic hue from the title so spine/placeholder colors vary. */
function hueFromTitle(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360
  return h
}

/* ------------------------------------------------------------------ */
/*  A single 3D book standing on the shelf (cover front + spine).      */
/* ------------------------------------------------------------------ */

function Book3D({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false)
  const label = STATUS_LABEL[book.status]
  const hue = hueFromTitle(book.title)
  const hasCover = Boolean(book.cover) && !failed

  return (
    <figure className="book3d-slot group">
      <div className="book3d">
        {/* Spine — the left edge, rotated back for depth. */}
        <span
          className="book3d-spine"
          style={{
            background: `linear-gradient(180deg, hsl(${hue} 46% 34%), hsl(${hue} 52% 22%))`,
          }}
        >
          <span className="book3d-spine-title">{book.title}</span>
        </span>

        {/* Front cover. */}
        <div className="book3d-front">
          {hasCover ? (
            <Image
              src={book.cover as string}
              alt={`Cover of ${book.title}`}
              fill
              sizes="(max-width: 640px) 110px, 150px"
              unoptimized
              onError={() => setFailed(true)}
              className="object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-full w-full flex-col items-center justify-center p-2 text-center"
              style={{
                background: `linear-gradient(150deg, hsl(${hue} 44% 40%), hsl(${hue} 50% 26%))`,
              }}
            >
              <BookOpen size={20} className="mb-1.5 text-white/80" />
              <span className="line-clamp-4 font-serif text-[0.68rem] font-semibold leading-tight text-white/95">
                {book.title}
              </span>
              <span className="mt-1.5 font-mono text-[0.55rem] tracking-[0.2em] text-white/55">
                {initials(book.title)}
              </span>
            </div>
          )}
          <span aria-hidden className="book3d-pages" />
          <span aria-hidden className="book3d-gloss" />
        </div>
      </div>

      <figcaption className="book3d-caption">
        <p className="line-clamp-2 font-semibold text-foreground">{book.title}</p>
        {book.author && <p className="mt-0.5 truncate text-xs text-muted">{book.author}</p>}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
          <span className={`book-pill book-pill--${book.status}`}>{label}</span>
          {book.rating && (
            <span
              className="book-rating"
              aria-label={`Rating: ${book.rating}`}
              title={`Rating: ${book.rating}`}
            >
              {book.rating}
            </span>
          )}
        </div>
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/*  A shelf unit: header + a wooden box of books with a plank.         */
/* ------------------------------------------------------------------ */

function Shelf({
  title,
  icon: Icon,
  books,
}: {
  title: string
  icon: typeof BookOpen
  books: Book[]
}) {
  const rowRef = useGsapReveal<HTMLDivElement>({ stagger: 0.07 })
  return (
    <section className="shelf-unit">
      <header className="shelf-head">
        <span className="shelf-head-icon" aria-hidden>
          <Icon size={15} />
        </span>
        <h2 className="shelf-head-title">{title}</h2>
        <span className="shelf-head-count">{books.length}</span>
      </header>

      <div className="shelf-box">
        <div ref={rowRef} className="shelf-row">
          {books.map((book) => (
            <Book3D key={book.id} book={book} />
          ))}
        </div>
        <div aria-hidden className="shelf-plank" />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Main view — a wooden library wall of shelves grouped by status.    */
/* ------------------------------------------------------------------ */

const BooksView = ({ content }: { content: BooksContent }) => {
  const { reading, read, want } = content

  const total = reading.length + read.length + (want?.length ?? 0)

  return (
    <div className="library mt-10">
      <div className="library-inner">
        {reading.length > 0 && (
          <Shelf title="In Progress" icon={BookOpen} books={reading} />
        )}
        {want && want.length > 0 && (
          <Shelf title="Not started" icon={BookMarked} books={want} />
        )}
        {read.length > 0 && <Shelf title="Read" icon={CheckCircle2} books={read} />}
      </div>

      <p className="library-foot">
        {total} {total === 1 ? 'book' : 'books'} on the shelf
      </p>
    </div>
  )
}

export default BooksView
