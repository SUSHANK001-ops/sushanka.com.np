'use client'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Warm, generic traveller-cafe house rules. No references to any real place.
const RULES: string[] = [
  'Be kind. This wall is a warm place for every traveller who passes through.',
  'Keep it clean — no slurs, no cruelty, nothing you would not pin up for a stranger to read.',
  'Share your own stories. Do not post other people’s private details.',
  'One promise at a time. Let the wall breathe between notes.',
  'What you pin here stays here for others to find. Make it something kind.',
]

/**
 * The clickable "Read the house rules" mailbox. Rendered as a real <button>
 * (the single interactive decorative prop), it opens a portaled, focus-trapped,
 * Escape-closable popup of the warm generic rules.
 */
export default function RulesMailbox() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setMounted(true), [])

  // Focus trap + Escape, restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    )
    focusables?.[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mz-prop-mailbox mz-prop-mailbox--rules"
        aria-label="Read the house rules"
        onClick={() => setOpen(true)}
      >
        <span className="mz-prop-mailbox__flag" aria-hidden="true" />
        <span className="mz-prop-mailbox__slot" aria-hidden="true" />
        <span className="mz-prop-mailbox__label" aria-hidden="true">
          Rules
        </span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="mz-modal-overlay" role="presentation">
            <div
              className="mz-modal-scrim"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={dialogRef}
              className="mz-rules-dialog mz-paper"
              role="dialog"
              aria-modal="true"
              aria-label="House rules"
            >
              <button
                type="button"
                className="mz-modal-close"
                aria-label="Close the house rules"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <h2 className="mz-rules-title">The house rules</h2>
              <p className="mz-rules-intro">
                A few gentle notes before you pin yours up.
              </p>
              <ul className="mz-rules-list">
                {RULES.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
