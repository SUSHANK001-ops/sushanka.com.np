import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'

export const dynamic = 'force-dynamic'

const presetEmojis = ['❤️', '🥰', '😂', '😮', '😢', '😡', '🔥', '👏']

/** POST — add, change, or remove the viewer's emoji reaction. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to like.' }, { status: 401 })
    }
    const uid = userKey(session)
    if (!uid) {
      return NextResponse.json({ error: 'Please sign in to like.' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const requestedEmoji = typeof body?.emoji === 'string' ? body.emoji.trim() : ''
    const emoji = presetEmojis.includes(requestedEmoji) ? requestedEmoji : '❤️'
    await connectDB()

    const entry = await GuestbookModel.findById(id).select('likes likeProfiles reactions')
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const reactions = Array.isArray(entry.reactions) ? [...entry.reactions] : []
    const currentIndex = reactions.findIndex((reaction) => reaction.userId === uid)
    const current = currentIndex >= 0 ? reactions[currentIndex] : null
    if (current?.emoji === emoji) {
      reactions.splice(currentIndex, 1)
    } else if (currentIndex >= 0) {
      reactions[currentIndex] = {
        ...current,
        emoji,
        name: session.user.name ?? 'Guest',
        avatar: session.user.image ?? undefined,
      }
    } else {
      reactions.push({
        userId: uid,
        emoji,
        name: session.user.name ?? 'Guest',
        avatar: session.user.image ?? undefined,
      })
    }
    entry.reactions = reactions
    entry.likes = reactions.map((reaction) => reaction.userId)
    entry.likeProfiles = reactions.map((reaction) => ({
      userId: reaction.userId,
      name: reaction.name,
      avatar: reaction.avatar,
    }))
    await entry.save()

    return NextResponse.json({
      success: true,
      likeCount: reactions.length,
      likedByMe: reactions.some((reaction) => reaction.userId === uid),
      reactionByMe: reactions.find((reaction) => reaction.userId === uid)?.emoji ?? null,
      likeProfiles: reactions.slice(0, 3).map((reaction) => ({
        userId: reaction.userId,
        name: reaction.name,
        avatar: reaction.avatar,
      })),
      reactions: [...new Set([...presetEmojis, ...reactions.map((reaction) => reaction.emoji)])]
        .map((value) => ({ emoji: value, count: reactions.filter((reaction) => reaction.emoji === value).length }))
        .filter((reaction) => reaction.count > 0),
    })
  } catch (error) {
    console.error('Guestbook like error:', error)
    return NextResponse.json({ error: 'Failed to update like.' }, { status: 500 })
  }
}
