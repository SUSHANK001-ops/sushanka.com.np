'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../../guestbook/ui'
import { INK_FOR_COLOR } from '../types'
import type { NoteColor, NoteFont, NoteInk, PublicNote } from '../types'
import StickyNote from './StickyNote'
import DrawCanvas from './DrawCanvas'

type Tab = 'write' | 'draw' | 'photo'

interface Draft {
  activeTab: Tab
  text: string
  font: NoteFont
  color: NoteColor
  ink_color: NoteInk
  drawingDataUrl: string | null // local preview before upload
  drawingUrl: string | null // Cloudinary URL after upload
  photoDataUrl: string | null // compressed preview before upload
  photoUrl: string | null // Cloudinary URL after upload
  photoCaption: string
  displayName: string
  isAnonymous: boolean
  alias: string
  agreeRules: boolean
}

const FONTS: { value: NoteFont; label: string }[] = [
  { value: 'caveat', label: 'Caveat' },
  { value: 'kalam', label: 'Kalam' },
  { value: 'patrick-hand', label: 'Patrick' },
  { value: 'reenie-beanie', label: 'Reenie' },
]

const COLORS: NoteColor[] = ['yellow', 'pink', 'mint', 'kraft', 'white', 'orange', 'blue']

const RULES_LS_KEY = 'musafir-rules-agreed'
const MAX_TEXT = 280
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

// Client resize/compress to ~1200px longest edge via an offscreen canvas.
// Prefer WebP; fall back to JPEG if toBlob('image/webp') is unsupported.
async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const longest = Math.max(bitmap.width, bitmap.height)
  const scale = longest > 1200 ? 1200 / longest : 1
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const toBlob = (type: string): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.85))

  const webp = await toBlob('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob('image/jpeg')
  return jpeg ?? file
}

async function uploadBlob(blob: Blob, filename: string): Promise<{ url: string; publicId: string }> {
  const form = new FormData()
  form.append('file', blob, filename)
  const res = await fetch('/api/musafir-cafe/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error('upload failed')
  return res.json()
}

interface ComposerProps {
  defaultName: string
  onClose: () => void
  onPosted: (note: PublicNote) => void
}

/**
 * The three-tab (write / draw / photo) composer. ONE shared `draft` state is
 * threaded across tabs + common fields, so switching tabs never loses work and
 * the live preview reflects the whole note. Portaled, focus-trapped,
 * Escape-to-close. Submit uploads any pending drawing/photo FIRST, then POSTs
 * only the Cloudinary URLs (NIT #8 — never the *DataUrl previews).
 */
export default function Composer({ defaultName, onClose, onPosted }: ComposerProps) {
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [agreedBefore] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RULES_LS_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [draft, setDraft] = useState<Draft>({
    activeTab: 'write',
    text: '',
    font: 'caveat',
    color: 'yellow',
    ink_color: 'blue',
    drawingDataUrl: null,
    drawingUrl: null,
    photoDataUrl: null,
    photoUrl: null,
    photoCaption: '',
    displayName: defaultName,
    isAnonymous: false,
    alias: '',
    agreeRules: agreedBefore,
  })

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => setMounted(true), [])

  // Focus trap + Escape, restore focus on close.
  useEffect(() => {
    const dialog = dialogRef.current
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
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

  // Allowed inks for the chosen paper; reset ink when paper changes.
  const allowedInks = INK_FOR_COLOR[draft.color]
  const changeColor = (color: NoteColor) => {
    const inks = INK_FOR_COLOR[color]
    setDraft((d) => ({
      ...d,
      color,
      ink_color: inks.includes(d.ink_color) ? d.ink_color : inks[0],
    }))
  }

  // Live preview note derived from the draft.
  const previewNote: PublicNote = useMemo(
    () => ({
      id: 'preview',
      display_name: draft.isAnonymous
        ? draft.alias.trim() || 'Anonymous Musafir'
        : draft.displayName.trim() || 'You',
      is_anonymous: draft.isAnonymous,
      text: draft.text,
      font: draft.font,
      color: draft.color,
      ink_color: draft.ink_color,
      drawing_url: draft.drawingDataUrl,
      photo_url: draft.photoDataUrl,
      photo_caption: draft.photoCaption || null,
      pos_x: 0,
      pos_y: 0,
      pos_x_v: 0,
      pos_y_v: 0,
      rotation: -2,
      z_index: 0,
      pin_style: 'pin-red',
      created_at: new Date().toISOString(),
      mine: true,
    }),
    [draft]
  )

  const nameValid = useMemo(() => {
    const n = (draft.isAnonymous ? draft.alias : draft.displayName).trim()
    // When anonymous with no alias we fall back to "Anonymous Musafir", so an
    // empty alias is allowed; otherwise require 2–24.
    if (draft.isAnonymous && n.length === 0) return true
    return n.length >= 2 && n.length <= 24
  }, [draft.displayName, draft.alias, draft.isAnonymous])

  const hasContent = Boolean(
    draft.text.trim() || draft.drawingDataUrl || draft.photoDataUrl
  )
  const textOk = draft.text.length <= MAX_TEXT
  const canSubmit = nameValid && draft.agreeRules && hasContent && textOk && !submitting

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Please choose a JPG, PNG, or WebP image.', 'error')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast('That photo is a little large (max 5MB).', 'error')
      return
    }
    try {
      const blob = await compressPhoto(file)
      if (draft.photoDataUrl) URL.revokeObjectURL(draft.photoDataUrl)
      const url = URL.createObjectURL(blob)
      setDraft((d) => ({ ...d, photoDataUrl: url, photoUrl: null }))
    } catch {
      // Fall back to the original file as the preview.
      const url = URL.createObjectURL(file)
      setDraft((d) => ({ ...d, photoDataUrl: url, photoUrl: null }))
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      let drawingUrl = draft.drawingUrl
      let drawingPublicId: string | undefined
      let photoUrl = draft.photoUrl
      let photoPublicId: string | undefined

      // Upload any pending drawing/photo FIRST — only Cloudinary URLs are sent.
      if (draft.drawingDataUrl && !drawingUrl) {
        const blob = await (await fetch(draft.drawingDataUrl)).blob()
        const up = await uploadBlob(blob, 'drawing.png')
        drawingUrl = up.url
        drawingPublicId = up.publicId
      }
      if (draft.photoDataUrl && !photoUrl) {
        const blob = await (await fetch(draft.photoDataUrl)).blob()
        const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg'
        const up = await uploadBlob(blob, `photo.${ext}`)
        photoUrl = up.url
        photoPublicId = up.publicId
      }

      const body = {
        text: draft.text,
        font: draft.font,
        color: draft.color,
        ink_color: draft.ink_color,
        display_name: draft.displayName,
        is_anonymous: draft.isAnonymous,
        alias: draft.isAnonymous ? draft.alias : undefined,
        drawing_url: drawingUrl ?? undefined,
        drawing_public_id: drawingPublicId,
        photo_url: photoUrl ?? undefined,
        photo_public_id: photoPublicId,
        photo_caption: draft.photoCaption || undefined,
        agree_rules: true, // sent on every submit, server requires it each time
      }

      const res = await fetch('/api/musafir-cafe/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'post failed')
      }

      try {
        localStorage.setItem(RULES_LS_KEY, 'true')
      } catch {
        /* ignore */
      }

      onPosted(data.note as PublicNote)
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error && err.message && err.message !== 'post failed'
          ? err.message
          : 'The paper slipped. Let’s try sticking it again.'
      toast(msg, 'error')
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="mz-modal-overlay" role="presentation">
      <div className="mz-modal-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="mz-composer"
        role="dialog"
        aria-modal="true"
        aria-label="Leave a note on the wall"
      >
        <button type="button" className="mz-modal-close" aria-label="Close the composer" onClick={onClose}>
          ×
        </button>

        <div className="mz-composer__grid">
          <div className="mz-composer__form">
            <div className="mz-tabs" role="tablist" aria-label="Note type">
              {(['write', 'draw', 'photo'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={draft.activeTab === t}
                  className={`mz-tab ${draft.activeTab === t ? 'is-active' : ''}`}
                  onClick={() => set('activeTab', t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {draft.activeTab === 'write' && (
              <div className="mz-tabpanel">
                <textarea
                  className={`mz-write mz-font-${draft.font} mz-ink-${draft.ink_color}`}
                  value={draft.text}
                  maxLength={MAX_TEXT + 40}
                  rows={5}
                  placeholder="Write your promise…"
                  aria-label="Note text"
                  onChange={(e) => set('text', e.target.value)}
                />
                <div className={`mz-counter ${draft.text.length > MAX_TEXT ? 'is-over' : ''}`}>
                  {draft.text.length}/{MAX_TEXT}
                </div>

                <label className="mz-field-label">Handwriting</label>
                <div className="mz-font-picker">
                  {FONTS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`mz-font-opt mz-font-${f.value} ${draft.font === f.value ? 'is-active' : ''}`}
                      aria-pressed={draft.font === f.value}
                      onClick={() => set('font', f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <label className="mz-field-label">Paper</label>
                <div className="mz-color-picker">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`mz-color-swatch mz-color-${c} ${draft.color === c ? 'is-active' : ''}`}
                      aria-label={`${c} paper`}
                      aria-pressed={draft.color === c}
                      onClick={() => changeColor(c)}
                    />
                  ))}
                </div>

                <label className="mz-field-label">Ink</label>
                <div className="mz-ink-picker">
                  {(['blue', 'black', 'brown'] as NoteInk[]).map((ink) => {
                    const allowed = allowedInks.includes(ink)
                    return (
                      <button
                        key={ink}
                        type="button"
                        disabled={!allowed}
                        className={`mz-ink-swatch mz-ink-dot-${ink} ${draft.ink_color === ink ? 'is-active' : ''}`}
                        aria-label={`${ink} ink${allowed ? '' : ' (too low contrast on this paper)'}`}
                        aria-pressed={draft.ink_color === ink}
                        onClick={() => allowed && set('ink_color', ink)}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {draft.activeTab === 'draw' && (
              <div className="mz-tabpanel">
                <DrawCanvas onChange={(url) => set('drawingDataUrl', url)} />
              </div>
            )}

            {draft.activeTab === 'photo' && (
              <div className="mz-tabpanel">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mz-file"
                  aria-label="Choose a photo"
                  onChange={onPickPhoto}
                />
                {draft.photoDataUrl && (
                  <div className="mz-photo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={draft.photoDataUrl} alt="Your photo preview" />
                  </div>
                )}
                <input
                  type="text"
                  className={`mz-caption mz-font-${draft.font}`}
                  value={draft.photoCaption}
                  maxLength={MAX_TEXT}
                  placeholder="Add a caption…"
                  aria-label="Photo caption"
                  onChange={(e) => set('photoCaption', e.target.value)}
                />
              </div>
            )}

            {/* Common fields */}
            <div className="mz-common">
              <label className="mz-field-label" htmlFor="mz-name">
                Your name
              </label>
              <input
                id="mz-name"
                type="text"
                className="mz-text-input"
                value={draft.displayName}
                maxLength={24}
                onChange={(e) => set('displayName', e.target.value)}
              />

              <label className="mz-checkbox">
                <input
                  type="checkbox"
                  checked={draft.isAnonymous}
                  onChange={(e) => set('isAnonymous', e.target.checked)}
                />
                Stay a mystery
              </label>
              {draft.isAnonymous && (
                <input
                  type="text"
                  className="mz-text-input"
                  value={draft.alias}
                  maxLength={24}
                  placeholder="Optional alias (else “Anonymous Musafir”)"
                  aria-label="Optional alias"
                  onChange={(e) => set('alias', e.target.value)}
                />
              )}

              <p className="mz-rules-line">
                Be kind, keep it clean, share your own stories.
              </p>
              <label className="mz-checkbox">
                <input
                  type="checkbox"
                  checked={draft.agreeRules}
                  onChange={(e) => set('agreeRules', e.target.checked)}
                />
                I agree to the house rules
              </label>
            </div>

            <button
              type="button"
              className="mz-btn mz-btn--primary mz-submit"
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? 'Sticking it on…' : 'Stick it on the wall'}
            </button>
          </div>

          <div className="mz-composer__preview">
            <span className="mz-preview-label">Preview</span>
            <div className="mz-preview-stage">
              <StickyNote note={previewNote} preview />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
