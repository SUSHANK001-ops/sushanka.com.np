'use client'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PublicNote } from '../types'

interface NoteModalProps {
  note: PublicNote
  onClose: () => void
  onDeleted: (id: string) => void
  onLift?: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * The full "read" view for a note: text, full-size drawing/photo, display name,
 * date. Portaled, focus-trapped, Escape-to-close. A report action POSTs to the
 * report route; the owner (`mine`) additionally sees a delete action that
 * DELETEs with optimistic removal.
 */
export default function NoteModal({ note, onClose, onDeleted, onLift }: NoteModalProps) {
  const [busy, setBusy] = useState<null | 'report' | 'delete'>(null)
  const [reported, setReported] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Soft paper-lift sound on open (gated + graceful upstream).
  useEffect(() => {
    onLift?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus trap + Escape.
  useEffect(() => {
    const dialog = dialogRef.current
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    )
    focusables?.[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
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
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const report = async () => {
    if (busy || reported) return
    setBusy('report')
    setActionError(null)
    try {
      const res = await fetch(`/api/musafir-cafe/notes/${note.id}/report`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error()
      setReported(true)
    } catch {
      setActionError('Couldn’t send that report. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy('delete')
    setActionError(null)
    try {
      const res = await fetch(`/api/musafir-cafe/notes/${note.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      onDeleted(note.id) // optimistic removal from the wall
      onClose()
    } catch {
      setActionError('Couldn’t take that note down. Try again.')
      setBusy(null)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="mz-modal-overlay" role="presentation">
      <div className="mz-modal-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={`mz-note-modal mz-paper mz-color-${note.color} mz-font-${note.font} mz-ink-${note.ink_color}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Note by ${note.display_name}`}
      >
        <button
          type="button"
          className="mz-modal-close"
          aria-label="Close this note"
          onClick={onClose}
        >
          ×
        </button>

        {note.photo_url && (
          <div className="mz-note-modal__photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={note.photo_url}
              alt={`Photo shared by ${note.display_name}`}
              loading="lazy"
            />
            {note.photo_caption && (
              <p className="mz-note-modal__caption">{note.photo_caption}</p>
            )}
          </div>
        )}

        {note.drawing_url && (
          <div className="mz-note-modal__drawing">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={note.drawing_url}
              alt={`Drawing by ${note.display_name}`}
              loading="lazy"
            />
          </div>
        )}

        {note.text && <p className="mz-note-modal__text">{note.text}</p>}

        <div className="mz-note-modal__meta">
          <span className="mz-note-modal__name">{note.display_name}</span>
          {note.created_at && (
            <span className="mz-note-modal__date">{formatDate(note.created_at)}</span>
          )}
        </div>

        {actionError && (
          <p className="mz-note-modal__error" role="alert">
            {actionError}
          </p>
        )}

        <div className="mz-note-modal__actions">
          {note.mine ? (
            <button
              type="button"
              className="mz-btn mz-btn--danger"
              onClick={remove}
              disabled={busy !== null}
            >
              {busy === 'delete' ? 'Taking it down…' : 'Take this note down'}
            </button>
          ) : (
            <button
              type="button"
              className="mz-btn mz-btn--quiet"
              onClick={report}
              disabled={busy !== null || reported}
            >
              {reported
                ? 'Thanks, we’ll take a look'
                : busy === 'report'
                  ? 'Reporting…'
                  : 'Report this note'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
