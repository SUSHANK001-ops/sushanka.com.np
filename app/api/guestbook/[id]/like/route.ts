import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

function userKey(session: { user?: { id?: string; email?: string | null } } | null) {
  return session?.user?.id ?? session?.user?.email ?? undefined
}

/** POST — toggle the viewer's like on an entry. Click again to unlike. */
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
    await connectDB()

    const entry = await GuestbookModel.findById(id).select('likes')
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const likes: string[] = Array.isArray(entry.likes) ? entry.likes : []
    const already = likes.includes(uid)

    // Atomic add/remove so concurrent clicks can't double-count.
    const update = already ? { $pull: { likes: uid } } : { $addToSet: { likes: uid } }
    const updated = await GuestbookModel.findByIdAndUpdate(id, update, {
      new: true,
    }).select('likes')

    const newLikes: string[] = Array.isArray(updated?.likes) ? updated!.likes : []

    return NextResponse.json({
      success: true,
      likeCount: newLikes.length,
      likedByMe: !already,
    })
  } catch (error) {
    console.error('Guestbook like error:', error)
    return NextResponse.json({ error: 'Failed to update like.' }, { status: 500 })
  }
}
