'use client'
import React, { useMemo, useState } from 'react'
import { Check, Sparkles, Target } from 'lucide-react'
import type { ManifestContent, RichSpan } from '@/lib/notion'
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

const ManifestView = ({ content }: { content: ManifestContent }) => {
  // Local checkbox state, seeded from Notion's `checked` values. Reading the
  // manifest and ticking items off is a personal ritual, so toggles stay
  // client-side (they don't write back to Notion).
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(content.todos.map((t) => [t.id, t.checked])),
  )

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))

  const doneCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  )

  const introRef = useGsapReveal<HTMLDivElement>({ y: 20 })
  const todosRef = useGsapReveal<HTMLUListElement>({ stagger: 0.05 })
  const goalsRef = useGsapReveal<HTMLDivElement>({ stagger: 0.08 })

  return (
    <>
      {/* Intro */}
      {content.intro.length > 0 && (
        <div ref={introRef} className="mt-4 space-y-3">
          {content.intro.map((spans, i) => (
            <p key={i} className="text-[0.975rem] leading-relaxed text-muted">
              <Rich spans={spans} />
            </p>
          ))}
        </div>
      )}

      {/* Manifest checklist */}
      {content.todos.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <h2 className="serif-title serif-section !mb-0">Manifest</h2>
          </div>
          <p className="mb-5 border-l-2 border-accent/50 pl-3 text-sm text-muted">
            Read these every morning. Tick them off as you live them.
          </p>

          <ul ref={todosRef} className="space-y-1">
            {content.todos.map((todo) => {
              const isDone = checked[todo.id]
              return (
                <li key={todo.id}>
                  <button
                    type="button"
                    onClick={() => toggle(todo.id)}
                    data-click-sound
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-foreground/[0.03]"
                    aria-pressed={isDone}
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors ${
                        isDone
                          ? 'border-accent bg-accent text-background'
                          : 'border-border group-hover:border-accent/60'
                      }`}
                    >
                      {isDone && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span
                      className={`text-[0.95rem] transition-colors ${
                        isDone ? 'text-muted line-through' : 'text-foreground'
                      }`}
                    >
                      <Rich spans={todo.spans} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="mt-4 text-right font-mono text-xs text-accent">
            {doneCount} out of {content.todos.length} lived today.
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

      {/* Last updated */}
      {content.lastEdited && (
        <p className="mt-12 border-t border-border pt-6 text-xs text-muted">
          Last updated:{' '}
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

export default ManifestView
