import { NextRequest, NextResponse } from 'next/server'

import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'

export const dynamic = 'force-dynamic'

function sanitize(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

/** PATCH — edit one's own message (and/or its image). Owner only. */
export async function PATCH(
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

    const body = await req.json()
    const message = sanitize(String(body?.message ?? ''))
    const hasImage = Object.prototype.hasOwnProperty.call(body, 'image')
    const image = hasImage
      ? body.image
        ? String(body.image).trim()
        : ''
      : undefined

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Message is too long (max 500).' }, { status: 400 })
    }
    if (image && image !== '' && !/^https?:\/\//i.test(image)) {
      return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })
    }

    await connectDB()
    const entry = await GuestbookModel.findById(id)
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }
    // Only the author may edit.
    if (!uid || entry.userId !== uid) {
      return NextResponse.json({ error: 'You can only edit your own message.' }, { status: 403 })
    }

    entry.message = message
    if (hasImage) entry.image = image || undefined
    await entry.save()

    return NextResponse.json({
      success: true,
      entry: {
        _id: entry._id,
        name: entry.name,
        message: entry.message,
        avatar: entry.avatar,
        userId: entry.userId,
        image: entry.image,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    })
  } catch (error) {
    console.error('Guestbook PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update message.' }, { status: 500 })
  }
}

/** DELETE — remove one's own message. Owner only. */
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

    await connectDB()
    const entry = await GuestbookModel.findById(id)
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }
    if (!uid || entry.userId !== uid) {
      return NextResponse.json({ error: 'You can only delete your own message.' }, { status: 403 })
    }

    await entry.deleteOne()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Guestbook DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete message.' }, { status: 500 })
  }
}
