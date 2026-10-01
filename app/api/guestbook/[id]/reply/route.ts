import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { getClientIp, rateLimit } from '@/lib/rateLimit'
import { auth, isAdminEmail } from '@/auth'
import { userKey } from '@/lib/userKey'
import { sendNotificationEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const REPLY_LIMIT = 15
const REPLY_WINDOW = 60 * 60 // 1 hour

function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

function isEmail(value?: string | null): value is string {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Figure out which address to notify for an entry. We prefer the explicit
 * `email` field saved at post time, then fall back to `userId` (which is the
 * lowercased email for most accounts). Only returns a real email address.
 */
function resolveRecipientEmail(entry: { email?: string; userId?: string }) {
  const candidate = entry.email?.trim() || entry.userId?.trim()
  return isEmail(candidate) ? candidate!.toLowerCase() : null
}

/** POST — add a text reply to an entry. Requires an authenticated session. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to reply.' }, { status: 401 })
    }
    if (!session.user.isAdmin) {
      return NextResponse.json({ error: 'Only admins can reply.' }, { status: 403 })
    }
    const uid = userKey(session)

    const { id } = await params
    const body = await req.json()
    const message = sanitize(String(body?.message ?? ''))

    if (!message) {
      return NextResponse.json({ error: 'Reply is required.' }, { status: 400 })
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Reply is too long (max 500).' }, { status: 400 })
    }

    // Rate limit replies per IP.
    const ip = getClientIp(req)
    const rl = await rateLimit('guestbook-reply', ip, REPLY_LIMIT, REPLY_WINDOW)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `You're replying too frequently. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    await connectDB()
    const entry = await GuestbookModel.findById(id)
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const reply = {
      userId: uid,
      name: sanitize(session.user.name ?? 'Anonymous').slice(0, 60) || 'Anonymous',
      avatar: session.user.image ?? undefined,
      message,
      isAdmin: isAdminEmail(session.user.email),
      isHidden: false,
    }

    entry.replies = entry.replies ?? []
    entry.replies.push(reply)
    await entry.save()

    const saved = entry.replies[entry.replies.length - 1]

    // Send email notification when an admin replies to a visitor's entry
    // (but not when the admin is replying to their own post).
    const recipientEmail = resolveRecipientEmail(entry)
    const adminEmail = session.user.email?.toLowerCase()
    if (session.user.isAdmin && recipientEmail && recipientEmail !== adminEmail) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || 'https://sushanka.com.np'
      const result = await sendNotificationEmail({
        to: recipientEmail,
        subject: 'Sushanka replied to your guestbook message 👋',
        recipientName: entry.name,
        replyText: message,
        originalMessage: entry.message,
        link: `${appUrl}/guestbook#entry-${entry._id}`,
      })
      if (!result.sent) {
        console.warn(
          `Guestbook reply: notification email to ${recipientEmail} was not sent (${result.reason}).`
        )
      }
    } else if (session.user.isAdmin && !recipientEmail) {
      console.warn(
        `Guestbook reply: no valid email on entry ${entry._id}; cannot notify the commenter.`
      )
    }

    return NextResponse.json({
      success: true,
      reply: {
        _id: saved._id,
        userId: saved.userId,
        name: saved.name,
        avatar: saved.avatar,
        message: saved.message,
        isAdmin: Boolean(saved.isAdmin),
        createdAt: saved.createdAt,
      },
    })
  } catch (error) {
    console.error('Guestbook reply POST error:', error)
    return NextResponse.json({ error: 'Failed to add reply.' }, { status: 500 })
  }
}

/** DELETE — remove one's own reply. Body: { replyId }. Owner only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }
    const uid = userKey(session)

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const replyId = String(body?.replyId ?? '')
    if (!replyId) {
      return NextResponse.json({ error: 'Reply id is required.' }, { status: 400 })
    }

    await connectDB()
    const entry = await GuestbookModel.findById(id)
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const reply = entry.replies?.id(replyId)
    if (!reply) {
      return NextResponse.json({ error: 'Reply not found.' }, { status: 404 })
    }
    // Only the reply's author may delete it here (admins use the admin route).
    if (!uid || reply.userId !== uid) {
      return NextResponse.json({ error: 'You can only delete your own reply.' }, { status: 403 })
    }

    reply.deleteOne()
    await entry.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Guestbook reply DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete reply.' }, { status: 500 })
  }
}
