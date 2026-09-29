import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'

export const dynamic = 'force-dynamic'

const presetEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏']

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
    const emoji = presetEmojis.includes(requestedEmoji) ? requestedEmoji : '👍'
    await connectDB()

    const entry = await GuestbookModel.findById(id).select('likes likeProfiles reactions')
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const currentIndex = entry.reactions.findIndex((reaction: any) => reaction.userId === uid)
    if (currentIndex >= 0) {
      if (entry.reactions[currentIndex].emoji === emoji) {
        entry.reactions.splice(currentIndex, 1)
      } else {
        entry.reactions[currentIndex].emoji = emoji
        entry.reactions[currentIndex].name = session.user.name ?? 'Guest'
        entry.reactions[currentIndex].avatar = session.user.image ?? undefined
      }
    } else {
      entry.reactions.push({
        userId: uid,
        emoji,
        name: session.user.name ?? 'Guest',
        avatar: session.user.image ?? undefined,
      })
    }
    
    entry.likes = entry.reactions.map((reaction: any) => reaction.userId)
    entry.likeProfiles = entry.reactions.map((reaction: any) => ({
      userId: reaction.userId,
      name: reaction.name,
      avatar: reaction.avatar,
    }))
    await entry.save()

    return NextResponse.json({
      success: true,
      likeCount: entry.reactions.length,
      likedByMe: entry.reactions.some((reaction: any) => reaction.userId === uid),
      reactionByMe: entry.reactions.find((reaction: any) => reaction.userId === uid)?.emoji ?? null,
      likeProfiles: entry.reactions.slice(0, 3).map((reaction: any) => ({
        userId: reaction.userId,
        name: reaction.name,
        avatar: reaction.avatar,
      })),
      reactions: [...new Set([...presetEmojis, ...entry.reactions.map((reaction: any) => reaction.emoji)])]
        .map((value) => ({ emoji: value, count: entry.reactions.filter((reaction: any) => reaction.emoji === value).length }))
        .filter((reaction: any) => reaction.count > 0),
      reactionProfiles: entry.reactions.map((r: any) => ({
        userId: r.userId,
        emoji: r.emoji,
        name: r.name,
        avatar: r.avatar,
      })),
    })
  } catch (error) {
    console.error('Guestbook like error:', error)
    return NextResponse.json({ error: 'Failed to update like.' }, { status: 500 })
  }
}
