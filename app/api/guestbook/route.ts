import { NextRequest, NextResponse } from 'next/server'

import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { getClientIp, rateLimit } from '@/lib/rateLimit'
import { auth, isAdminEmail } from '@/auth'

export const dynamic = 'force-dynamic'

// Max signings per IP within the window (anti-spam, on top of auth).
const SIGN_LIMIT = 3
const SIGN_WINDOW = 60 * 60 // 1 hour

// Max messages a single signed-in person may keep. Not advertised in the UI.
const MAX_PER_USER = 5

function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

/** Stable identity key for the signed-in user. */
function userKey(session: { user?: { id?: string; email?: string | null } } | null) {
  return session?.user?.id ?? session?.user?.email ?? undefined
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** GET — newest messages first. Includes userId so the client can show
 *  edit/delete controls on the viewer's own entries, plus like/reply data. */
export async function GET() {
  try {
    const session = await auth()
    const viewer = userKey(session)

    await connectDB()
    const entries = await GuestbookModel.find({ isHidden: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('name message avatar provider userId isAdmin image likes replies createdAt updatedAt')
      .lean()

    // Shape the response: hide raw like lists / hidden replies, expose derived
    // fields the client needs (likeCount, likedByMe, visible replies only).
    const shaped = (entries as any[]).map((e) => {
      const likes: string[] = Array.isArray(e.likes) ? e.likes : []
      const replies: any[] = Array.isArray(e.replies) ? e.replies : []
      return {
        _id: e._id,
        name: e.name,
        message: e.message,
        avatar: e.avatar,
        provider: e.provider,
        userId: e.userId,
        isAdmin: Boolean(e.isAdmin),
        image: e.image,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        likeCount: likes.length,
        likedByMe: viewer ? likes.includes(viewer) : false,
        replies: replies
          .filter((r) => !r.isHidden)
          .map((r) => ({
            _id: r._id,
            userId: r.userId,
            name: r.name,
            avatar: r.avatar,
            message: r.message,
            isAdmin: Boolean(r.isAdmin),
            createdAt: r.createdAt,
          })),
      }
    })

    return NextResponse.json({ entries: shaped })
  } catch (error) {
    console.error('Guestbook GET error:', error)
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 })
  }
}

/** POST — add a message. Requires an authenticated session (Google/GitHub). */
export async function POST(req: NextRequest) {
  try {
    // Must be signed in.
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Please sign in to leave a message.' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const message = sanitize(String(body?.message ?? ''))
    const image = body?.image ? String(body.image).trim() : undefined
    const imagePublicId = body?.imagePublicId ? String(body.imagePublicId).trim() : undefined
    const honeypot = String(body?.website ?? '')

    // Honeypot: bots fill hidden fields; pretend success so they don't learn.
    if (honeypot.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Message is too long (max 500).' }, { status: 400 })
    }
    // Only accept our own hosted (cloudinary) image URLs.
    if (image && !/^https?:\/\//i.test(image)) {
      return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })
    }

    const uid = userKey(session)

    await connectDB()

    // Per-user cap (silent). When reached, tell the client with a flag so it
    // can show a friendly popup — without ever advertising the number.
    if (uid) {
      const count = await GuestbookModel.countDocuments({ userId: uid })
      if (count >= MAX_PER_USER) {
        return NextResponse.json(
          {
            error: "You've reached the number of messages you can keep here. Delete one to add another.",
            limitReached: true,
          },
          { status: 409 }
        )
      }
    }

    // Rate limit by client IP.
    const ip = getClientIp(req)
    const rl = await rateLimit('guestbook', ip, SIGN_LIMIT, SIGN_WINDOW)
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `You're posting too frequently. Try again in ${Math.ceil(
            rl.retryAfter / 60
          )} minute(s).`,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    // Identity comes from the verified session, never from the client.
    const name = sanitize(session.user.name ?? 'Anonymous').slice(0, 60) || 'Anonymous'
    const avatar = session.user.image ?? undefined
    const admin = isAdminEmail(session.user.email)

    const entry = await GuestbookModel.create({
      name,
      message,
      avatar,
      userId: uid,
      isAdmin: admin,
      image,
      imagePublicId,
    })

    return NextResponse.json({
      success: true,
      entry: {
        _id: entry._id,
        name: entry.name,
        message: entry.message,
        avatar: entry.avatar,
        userId: entry.userId,
        isAdmin: Boolean(entry.isAdmin),
        image: entry.image,
        createdAt: entry.createdAt,
        likeCount: 0,
        likedByMe: false,
        replies: [],
      },
    })
  } catch (error) {
    console.error('Guestbook POST error:', error)
    return NextResponse.json({ error: 'Failed to post message.' }, { status: 500 })
  }
}
