import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'

import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'
import { rateLimit } from '@/lib/rateLimit'
import { getPromiseNoteModel } from '@/model/promiseNoteModel'
import { isClean } from '@/lib/profanity'
import {
  Z_CAP,
  H_WALL_SEED_WIDTH,
  H_WALL_HEIGHT,
  V_WALL_WIDTH,
  V_WALL_SEED_HEIGHT,
  noteBox,
  inflatedBox,
  placeNote,
  seedFromId,
} from '@/lib/notePlacement'
import {
  INK_FOR_COLOR,
  type NoteFont,
  type NoteColor,
  type NoteInk,
  type PinStyle,
  type PublicNote,
} from '@/app/(site)/musafir-cafe/types'

export const dynamic = 'force-dynamic'

// COPIED verbatim from the guestbook route's private sanitize() — that function
// is a module-local helper in app/api/guestbook/route.ts and CANNOT be imported,
// so its identical logic (strip control chars, collapse whitespace, trim) is
// reproduced here per the sanitize-copy note.
function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

const FONTS: NoteFont[] = ['caveat', 'kalam', 'patrick-hand', 'reenie-beanie']
const COLORS: NoteColor[] = ['yellow', 'pink', 'mint', 'kraft', 'white', 'orange', 'blue']
const INKS: NoteInk[] = ['blue', 'black', 'brown']
const PIN_STYLES: PinStyle[] = ['none', 'pin-red', 'pin-blue', 'pin-yellow', 'tape-h', 'tape-diag']

const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\//

/**
 * Keyset cursor on (created_at, _id). Format and parse live together here so
 * the two can never drift. A malformed cursor parses to null → first page.
 */
function parseCursor(cursor: string | null): { ts: Date; id: string } | null {
  if (!cursor) return null
  const sep = cursor.indexOf('|')
  if (sep === -1) return null
  const tsStr = cursor.slice(0, sep)
  const id = cursor.slice(sep + 1)
  if (!tsStr || !id) return null
  const ts = new Date(tsStr)
  if (Number.isNaN(ts.getTime())) return null
  return { ts, id }
}

function formatCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`
}

/** Build the public note shape explicitly — never spread the raw doc, never
 *  leak user_id or any *_public_id. */
function toPublicNote(doc: Record<string, unknown>, mine: boolean): PublicNote {
  const createdAt = doc.created_at as Date
  return {
    id: String(doc._id),
    display_name: String(doc.display_name ?? ''),
    is_anonymous: Boolean(doc.is_anonymous),
    text: String(doc.text ?? ''),
    font: doc.font as NoteFont,
    color: doc.color as NoteColor,
    ink_color: doc.ink_color as NoteInk,
    drawing_url: (doc.drawing_url as string | null) ?? null,
    photo_url: (doc.photo_url as string | null) ?? null,
    photo_caption: (doc.photo_caption as string | null) ?? null,
    pos_x: Number(doc.pos_x),
    pos_y: Number(doc.pos_y),
    pos_x_v: Number(doc.pos_x_v),
    pos_y_v: Number(doc.pos_y_v),
    rotation: Number(doc.rotation),
    z_index: Number(doc.z_index),
    pin_style: doc.pin_style as PinStyle,
    created_at: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
    mine,
  }
}

/**
 * GET — public, no auth required. Visible notes, newest first, with a true
 * keyset pagination on (created_at, _id). Malformed cursor → first page.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const rawLimit = Number(searchParams.get('limit'))
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT

    const cursor = parseCursor(searchParams.get('cursor'))

    const session = await auth()
    const viewer = userKey(session)

    const Model = await getPromiseNoteModel()

    const filter = cursor
      ? {
          status: 'visible' as const,
          $or: [
            { created_at: { $lt: cursor.ts } },
            { created_at: cursor.ts, _id: { $lt: cursor.id } },
          ],
        }
      : { status: 'visible' as const }

    // +1 probe row to detect hasMore.
    const docs = await Model.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .limit(limit + 1)
      .lean()

    const hasMore = docs.length > limit
    const page = hasMore ? docs.slice(0, limit) : docs

    const notes = page.map((doc) => {
      const d = doc as unknown as Record<string, unknown>
      const mine = Boolean(viewer && d.user_id === viewer)
      return toPublicNote(d, mine)
    })

    const last = page[page.length - 1] as unknown as Record<string, unknown> | undefined
    const nextCursor = hasMore && last
      ? formatCursor(last.created_at as Date, String(last._id))
      : null

    return NextResponse.json({ notes, nextCursor, hasMore })
  } catch (error) {
    console.error('Musafir Cafe notes GET error:', error)
    return NextResponse.json(
      { error: 'Dusting off the wall is taking a moment. Try again.' },
      { status: 500 }
    )
  }
}

/**
 * POST — create a note. Auth required. Order of operations fails cheap first:
 * auth → body parse → field validation → profanity → rate limit → DB.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Take a seat first. Sign in to leave your note.' },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Your note is empty.' }, { status: 400 })
    }

    // House rules must be agreed on every POST.
    if (body.agree_rules !== true) {
      return NextResponse.json(
        { error: 'Please agree to the house rules first.' },
        { status: 400 }
      )
    }

    // --- Content presence (at least one of text / drawing / photo) ---------
    const rawText = typeof body.text === 'string' ? body.text : ''
    const text = sanitize(rawText)
    const drawingUrl = typeof body.drawing_url === 'string' ? body.drawing_url.trim() : ''
    const photoUrl = typeof body.photo_url === 'string' ? body.photo_url.trim() : ''

    if (!text && !drawingUrl && !photoUrl) {
      return NextResponse.json({ error: 'Your note is empty.' }, { status: 400 })
    }

    // --- Text length ------------------------------------------------------
    if (text.length > 280) {
      return NextResponse.json(
        { error: 'That note is a little too long (max 280).' },
        { status: 400 }
      )
    }

    // --- Display name (2–24 after sanitize) -------------------------------
    const displayName = sanitize(typeof body.display_name === 'string' ? body.display_name : '')
    if (displayName.length < 2 || displayName.length > 24) {
      return NextResponse.json(
        { error: 'A name between 2 and 24 characters, please.' },
        { status: 400 }
      )
    }

    // --- Anonymity + alias ------------------------------------------------
    const isAnonymous = Boolean(body.is_anonymous)
    const alias = sanitize(typeof body.alias === 'string' ? body.alias : '')
    if (alias && (alias.length < 2 || alias.length > 24)) {
      return NextResponse.json(
        { error: 'A name between 2 and 24 characters, please.' },
        { status: 400 }
      )
    }
    // When anonymous, the public display name is forced to the alias (if any)
    // or 'Anonymous Musafir'; the real account name is never stored publicly.
    const publicDisplayName = isAnonymous
      ? (alias || 'Anonymous Musafir')
      : displayName

    // --- Enums ------------------------------------------------------------
    const font = body.font as NoteFont
    const color = body.color as NoteColor
    const inkColor = body.ink_color as NoteInk
    if (!FONTS.includes(font)) {
      return NextResponse.json({ error: 'Unknown font.' }, { status: 400 })
    }
    if (!COLORS.includes(color)) {
      return NextResponse.json({ error: 'Unknown color.' }, { status: 400 })
    }
    if (!INKS.includes(inkColor)) {
      return NextResponse.json({ error: 'Unknown ink.' }, { status: 400 })
    }

    // --- Ink/paper contrast pairing --------------------------------------
    if (!INK_FOR_COLOR[color].includes(inkColor)) {
      return NextResponse.json(
        { error: 'That ink is hard to read on that paper.' },
        { status: 400 }
      )
    }

    // --- Image URLs: only our Cloudinary host (NIT #8 — never blob:/data:) -
    if (drawingUrl && !CLOUDINARY_URL_RE.test(drawingUrl)) {
      return NextResponse.json({ error: "That image didn't come from here." }, { status: 400 })
    }
    if (photoUrl && !CLOUDINARY_URL_RE.test(photoUrl)) {
      return NextResponse.json({ error: "That image didn't come from here." }, { status: 400 })
    }

    // --- Public ids (optional; plain string ≤ 256) ------------------------
    const drawingPublicIdRaw = body.drawing_public_id
    const photoPublicIdRaw = body.photo_public_id
    if (drawingPublicIdRaw != null && (typeof drawingPublicIdRaw !== 'string' || drawingPublicIdRaw.length > 256)) {
      return NextResponse.json({ error: "That image didn't come from here." }, { status: 400 })
    }
    if (photoPublicIdRaw != null && (typeof photoPublicIdRaw !== 'string' || photoPublicIdRaw.length > 256)) {
      return NextResponse.json({ error: "That image didn't come from here." }, { status: 400 })
    }
    const drawingPublicId = typeof drawingPublicIdRaw === 'string' ? drawingPublicIdRaw : null
    const photoPublicId = typeof photoPublicIdRaw === 'string' ? photoPublicIdRaw : null

    // --- Photo caption (sanitize, ≤ 280) ----------------------------------
    const photoCaption = sanitize(typeof body.photo_caption === 'string' ? body.photo_caption : '')
    if (photoCaption.length > 280) {
      return NextResponse.json(
        { error: 'That note is a little too long (max 280).' },
        { status: 400 }
      )
    }

    // --- Profanity (text + caption, AFTER sanitize) -----------------------
    if (!isClean(text) || !isClean(photoCaption)) {
      return NextResponse.json({ error: "Let's keep it kind." }, { status: 400 })
    }

    // --- Identity guard (user_id must be a non-empty string) --------------
    const uid = userKey(session)
    if (!uid) {
      return NextResponse.json(
        { error: 'Take a seat first. Sign in to leave your note.' },
        { status: 401 }
      )
    }

    // --- Rate limits (per-min then per-day) -------------------------------
    const perMin = await rateLimit('musafir-note-min', uid, 1, 60)
    if (!perMin.allowed) {
      return NextResponse.json(
        { error: 'One note a minute, Musafir. Catch your breath.' },
        { status: 429, headers: { 'Retry-After': String(perMin.retryAfter) } }
      )
    }
    const perDay = await rateLimit('musafir-note-day', uid, 20, 86400)
    if (!perDay.allowed) {
      return NextResponse.json(
        { error: "That's enough notes for today. Come back tomorrow." },
        { status: 429, headers: { 'Retry-After': String(perDay.retryAfter) } }
      )
    }

    // --- DB: load the current visible set --------------------------------
    const Model = await getPromiseNoteModel()

    // MEDIUM fix 1: this ONE projection feeds BOTH placement passes — rotation
    // and created_at are REQUIRED here (rotation to inflate each existing box,
    // created_at left available for ordering), alongside both coordinate pairs.
    const visible = await Model.find({ status: 'visible' })
      .select('pos_x pos_y pos_x_v pos_y_v photo_url z_index rotation created_at')
      .lean()

    const maxZ = visible.reduce((m, n) => {
      const z = Number((n as unknown as { z_index?: number }).z_index ?? 0)
      return z > m ? z : m
    }, 0)
    const zIndex = Math.min(maxZ + 1, Z_CAP)

    // Generate the _id up front so the placement seed is a pure function of the
    // final document id and both passes are reproducible.
    const _id = new mongoose.Types.ObjectId()
    const seed = seedFromId(_id.toHexString())

    // Build the existing-note boxes for both orientations from the single query.
    const existingH = visible.map((n) => {
      const d = n as unknown as {
        pos_x: number; pos_y: number; photo_url?: string | null; rotation: number
      }
      const { w, h } = noteBox(Boolean(d.photo_url))
      return inflatedBox(d.pos_x, d.pos_y, w, h, d.rotation)
    })
    const existingV = visible.map((n) => {
      const d = n as unknown as {
        pos_x_v: number; pos_y_v: number; photo_url?: string | null; rotation: number
      }
      const { w, h } = noteBox(Boolean(d.photo_url))
      return inflatedBox(d.pos_x_v, d.pos_y_v, w, h, d.rotation)
    })

    const incomingIsPhoto = Boolean(photoUrl)
    const { w: noteW, h: noteH } = noteBox(incomingIsPhoto)

    // Horizontal pass → pos_x/pos_y.
    const h = placeNote({
      existing: existingH,
      noteW,
      noteH,
      wall: { width: H_WALL_SEED_WIDTH, height: H_WALL_HEIGHT },
      orientation: 'horizontal',
      seed,
    })
    // Vertical pass → pos_x_v/pos_y_v (shares the same seed → same rotation).
    const v = placeNote({
      existing: existingV,
      noteW,
      noteH,
      wall: { width: V_WALL_WIDTH, height: V_WALL_SEED_HEIGHT },
      orientation: 'vertical',
      seed,
    })

    const rotation = h.placement.rotation

    // Pick pin_style via the seeded PRNG (most notes get none).
    const pinStyle = pickPinStyle(seed)

    const created = await Model.create({
      _id,
      user_id: uid,
      display_name: publicDisplayName,
      is_anonymous: isAnonymous,
      text,
      font,
      color,
      ink_color: inkColor,
      drawing_url: drawingUrl || null,
      photo_url: photoUrl || null,
      drawing_public_id: drawingPublicId,
      photo_public_id: photoPublicId,
      photo_caption: photoCaption || null,
      pos_x: h.placement.pos_x,
      pos_y: h.placement.pos_y,
      pos_x_v: v.placement.pos_x,
      pos_y_v: v.placement.pos_y,
      rotation,
      z_index: zIndex,
      pin_style: pinStyle,
    })

    const doc = created.toObject() as unknown as Record<string, unknown>
    return NextResponse.json({ note: toPublicNote(doc, true) })
  } catch (error) {
    console.error('Musafir Cafe notes POST error:', error)
    return NextResponse.json({ error: 'Failed to post your note.' }, { status: 500 })
  }
}

/**
 * Seeded pin-style pick. Derived from the note's seed so every visitor sees the
 * same decoration. Most notes get no pin; a minority get a pin or tape.
 */
function pickPinStyle(seed: number): PinStyle {
  // Simple deterministic draw from the seed (independent of placement draws).
  const r = ((seed ^ 0x9e3779b9) >>> 0) / 4294967296
  if (r < 0.6) return 'none'
  const decorated = PIN_STYLES.filter((p) => p !== 'none')
  const idx = (seed >>> 3) % decorated.length
  return decorated[idx]
}
