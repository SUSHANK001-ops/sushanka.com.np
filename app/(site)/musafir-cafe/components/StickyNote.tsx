'use client'
import React from 'react'
import type { PublicNote } from '../types'

// CSS z-index band for a note: baseZ = min(10 + z_index, 9010).
export function noteBaseZ(zIndex: number): number {
  return Math.min(10 + zIndex, 9010)
}

interface StickyNoteProps {
  note: PublicNote
  // When set, StickyNote is being used as the composer's live preview and
  // should not be interactive / absolutely positioned by stored coordinates.
  preview?: boolean
  isNew?: boolean
  onOpen?: (note: PublicNote) => void
}

/**
 * A single sticky note: an absolutely-positioned <article> at left/top with a
 * per-note rotation and z-index. MEDIUM fix 2: the .mz-note--photo (taller) box
 * is applied under EXACTLY the `photo_url != null` condition so the rendered
 * height equals the placement height.
 */
function StickyNote({ note, preview = false, isNew = false, onOpen }: StickyNoteProps) {
  const isPhoto = note.photo_url != null // MEDIUM fix 2 — the only height flag.

  const classes = [
    'mz-note',
    `mz-color-${note.color}`,
    `mz-font-${note.font}`,
    `mz-ink-${note.ink_color}`,
    isPhoto ? 'mz-note--photo' : '',
    note.mine ? 'mz-note--mine' : '',
    isNew ? 'mz-note--new' : '',
    preview ? 'mz-note--preview' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const style: React.CSSProperties = {
    ['--rot' as string]: `${note.rotation}deg`,
  }
  if (!preview) {
    style.left = `${note.pos_x}px`
    style.top = `${note.pos_y}px`
    style.zIndex = noteBaseZ(note.z_index)
  }

  const label = `Note by ${note.display_name}. Press Enter to read.`

  const open = () => {
    if (!preview && onOpen) onOpen(note)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (preview) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }

  // Pin / tape marker from pin_style.
  const pinClass =
    note.pin_style === 'none' ? null : `mz-pin mz-pin--${note.pin_style}`

  return (
    <article
      className={classes}
      style={style}
      tabIndex={preview ? -1 : 0}
      role={preview ? undefined : 'button'}
      aria-label={preview ? undefined : label}
      aria-hidden={preview ? true : undefined}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      {pinClass && <span className={pinClass} aria-hidden="true" />}
      <span className="mz-adhesive" aria-hidden="true" />

      {isPhoto && (
        <div className="mz-note-photo-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="mz-note-photo"
            src={note.photo_url as string}
            alt={`Photo shared by ${note.display_name}`}
            loading="lazy"
          />
          {note.photo_caption && (
            <p className="mz-note-caption">{note.photo_caption}</p>
          )}
        </div>
      )}

      {note.drawing_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="mz-note-drawing"
          src={note.drawing_url}
          alt={`Drawing by ${note.display_name}`}
          loading="lazy"
        />
      )}

      {note.text && <p className="mz-note-text">{note.text}</p>}

      {note.mine && <span className="mz-note-mine" aria-hidden="true" />}
      <span className="mz-note-curl" aria-hidden="true" />
    </article>
  )
}

export default React.memo(StickyNote)
