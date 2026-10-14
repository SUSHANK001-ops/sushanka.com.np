'use client'
import React, { useState } from 'react'
import Image from 'next/image'
import { BookOpen, BookMarked, CheckCircle2, Star } from 'lucide-react'
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

/* A small deterministic hue from the title so spine/placeholder colors vary. */
function hueFromTitle(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360
  return h
}

/* ------------------------------------------------------------------ */
/*  3D book — stands upright on the shelf with a front cover + spine.  */
/* ------------------------------------------------------------------ */

function Book3D({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false)
  const label = STATUS_LABEL[book.status]
  const hue = hueFromTitle(book.title)
  const hasCover = Boolean(book.cover) && !failed

  return (
    <div className="book3d-slot group">
      <div className="book3d" title={`${book.title}${book.author ? ` — ${book.author}` : ''}`}>
        {/* Spine (left side, rotated back in 3D) */}
        <div
          className="book3d-spine"
          style={{
            background: `linear-gradient(180deg, hsl(${hue} 45% 32%), hsl(${hue} 50% 22%))`,
          }}
        >
          <span className="book3d-spine-title">{book.title}</span>
        </div>

        {/* Front cover */}
        <div className="book3d-front">
          {hasCover ? (
            <Image
              src={book.cover as string}
              alt={`Cover of ${book.title}`}
              fill
              sizes="150px"
              // Notion-hosted covers are signed S3 URLs (~1h expiry); skip
              // optimization so each render uses the fresh signed URL.
              unoptimized
              onError={() => setFailed(true)}
              className="object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-full w-full flex-col items-center justify-center p-2 text-center"
              style={{
                background: `linear-gradient(145deg, hsl(${hue} 42% 38%), hsl(${hue} 48% 26%))`,
              }}
            >
              <BookOpen size={18} className="mb-1 text-white/80" />
              <span className="line-clamp-3 font-serif text-[0.62rem] font-semibold leading-tight text-white/90">
                {book.title}
              </span>
              <span className="mt-1 font-mono text-[0.55rem] tracking-widest text-white/60">
                {initials(book.title)}
              </span>
            </div>
          )}
          {/* subtle page edge + gloss */}
          <span aria-hidden className="book3d-pages" />
          <span aria-hidden className="book3d-gloss" />
        </div>
      </div>

      {/* Caption below the book */}
      <div className="book3d-caption">
        <p className="truncate font-semibold text-foreground">{book.title}</p>
        {book.author && <p className="truncate text-xs text-muted">{book.author}</p>}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full border border-border bg-surface/70 px-2 py-0.5 font-mono text-[0.62rem] text-muted">
            {label}
          </span>
          {book.rating && (
            <span className="inline-flex items-center gap-0.5 text-[0.62rem] text-muted">
              <Star size={10} className="text-accent" aria-hidden />
              {book.rating}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  A shelf: a titled row of 3D books on a wooden plank.               */
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
  const rowRef = useGsapReveal<HTMLDivElement>({ stagger: 0.08 })
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-accent" />
        <h2 className="serif-title serif-section !mb-0">{title}</h2>
        <span className="ml-1 font-mono text-xs text-muted">({books.length})</span>
      </div>

      <div className="shelf">
        <div ref={rowRef} className="shelf-row">
          {books.map((book) => (
            <Book3D key={book.id} book={book} />
          ))}
        </div>
        {/* wooden plank the books stand on */}
        <div aria-hidden className="shelf-plank" />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Main view — a library wall of shelves, grouped by status.          */
/* ------------------------------------------------------------------ */

const BooksView = ({ content }: { content: BooksContent }) => {
  const { reading, read, want } = content

  return (
    <div className="library mt-10 rounded-2xl p-5 md:p-8">
      {reading.length > 0 && (
        <Shelf title="In Progress" icon={BookOpen} books={reading} />
      )}

      {want && want.length > 0 && (
        <Shelf title="Not started" icon={BookMarked} books={want} />
      )}

      {read.length > 0 && <Shelf title="Read" icon={CheckCircle2} books={read} />}
    </div>
  )
}

export default BooksView
