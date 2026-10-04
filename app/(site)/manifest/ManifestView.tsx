'use client'
import React, { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, Sparkles, Target, Heart, X, ArrowUpRight } from 'lucide-react'
import type { ManifestContent, RichSpan, TodoItem } from '@/lib/notion'
import { useGsapReveal } from '../../ui/useGsapReveal'

/** Render Notion rich-text spans with their inline formatting + links. */
function Rich({ spans }: { spans: RichSpan[] }) {
  return (
    <>
      {spans.map((s, i) => {
        let node: React.ReactNode = s.text
        if (s.code) node = <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.9em]">{node}</code>
        if (s.bold) node = <strong className="font-semibold text-foreground">{node}</strong>
        if (s.italic) node = <em>{node}</em>
        if (s.href) {
          node = (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline-offset-2 hover:underline"
            >
              {node}
            </a>
          )
        }
        return <React.Fragment key={i}>{node}</React.Fragment>
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Sponsor modal — shown when a visitor taps a (read-only) item.      */
/* ------------------------------------------------------------------ */

function SponsorModal({
  item,
  onClose,
}: {
  item: TodoItem | null
  onClose: () => void
}) {
  const open = Boolean(item)

  // Lock page scroll + wire Esc ONLY while the modal is open, and always
  // restore scroll on close so the page never gets stuck.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="manifest-pop relative w-full max-w-xs rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1 text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X size={16} />
        </button>

        <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Heart size={18} className="fill-current" />
        </div>

        <h3 className="serif-title text-lg text-foreground">Want to sponsor this?</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Reach out and I&apos;ll add you to my gratitude page.
        </p>

        <Link
          href="/contact"
          data-click-sound
          className="group mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
        >
          Contact me
          <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main view                                                          */
/* ------------------------------------------------------------------ */

const ManifestView = ({ content }: { content: ManifestContent }) => {
  const [active, setActive] = useState<TodoItem | null>(null)

  // Checked state is READ-ONLY — it reflects exactly what Notion says. Only I
  // can change it, from my Notion. Visitors tapping an item get the sponsor
  // modal instead of a toggle.
  const doneCount = useMemo(
    () => content.todos.filter((t) => t.checked).length,
    [content.todos],
  )

  const introRef = useGsapReveal<HTMLDivElement>({ y: 20 })
  const todosRef = useGsapReveal<HTMLUListElement>({ stagger: 0.05 })
  const goalsRef = useGsapReveal<HTMLDivElement>({ stagger: 0.08 })

  return (
    <>
      {/* Intro — Notion copy if present, else a default sponsor note. */}
      <div ref={introRef} className="mt-4 space-y-3">
        {content.intro.length > 0 ? (
          content.intro.map((spans, i) => (
            <p key={i} className="text-[0.975rem] leading-relaxed text-muted">
              <Rich spans={spans} />
            </p>
          ))
        ) : (
          <p className="text-[0.975rem] leading-relaxed text-muted">
            If you&apos;re interested in sponsoring any of the items listed below,
            feel free to reach out through the{' '}
            <Link href="/contact" className="text-link underline-offset-2 hover:underline">
              contact
            </Link>{' '}
            page. Your support is greatly appreciated and will be acknowledged
            with a special gratitude page dedicated to my sponsors.
          </p>
        )}
      </div>

      {/* Manifest / bucket list */}
      {content.todos.length > 0 && (
        <section className="mt-14">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <h2 className="serif-title serif-section !mb-0">Manifest List</h2>
          </div>

          <ul ref={todosRef} className="divide-y divide-border/60 border-y border-border/60">
            {content.todos.map((todo) => {
              const isDone = todo.checked
              return (
                <li key={todo.id}>
                  <button
                    type="button"
                    onClick={() => setActive(todo)}
                    data-click-sound
                    className="group flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                    aria-label="View sponsorship info"
                  >
                    {/* Read-only indicator mirroring Notion's checked state */}
                    <span
                      aria-hidden
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors ${
                        isDone
                          ? 'border-accent bg-accent text-background'
                          : 'border-border group-hover:border-accent/60'
                      }`}
                    >
                      {isDone && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span
                      className={`flex-1 font-mono text-[0.9rem] transition-colors ${
                        isDone ? 'text-muted line-through' : 'text-foreground group-hover:text-accent'
                      }`}
                    >
                      <Rich spans={todo.spans} />
                    </span>
                    <Heart
                      size={14}
                      className="shrink-0 text-muted/0 transition-colors group-hover:text-accent"
                    />
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="mt-4 text-right font-mono text-xs text-accent">
            {doneCount} out of {content.todos.length} completed.
          </p>
        </section>
      )}

      {/* Learning goals */}
      {content.goals.length > 0 && (
        <section className="mt-16">
          <div className="mb-5 flex items-center gap-2">
            <Target size={18} className="text-accent" />
            <h2 className="serif-title serif-section !mb-0">My Learning Goals</h2>
          </div>

          <div ref={goalsRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {content.goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40"
              >
                <h3 className="font-semibold text-foreground">{goal.title}</h3>
                {goal.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {goal.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Last updated — proof it auto-syncs from Notion. */}
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

      <SponsorModal item={active} onClose={() => setActive(null)} />
    </>
  )
}

export default ManifestView
