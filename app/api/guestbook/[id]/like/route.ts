import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'

export const dynamic = 'force-dynamic'

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

    const entry = await GuestbookModel.findById(id).select('likes likeProfiles')
    if (!entry) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const likes: string[] = Array.isArray(entry.likes) ? entry.likes : []
    const already = likes.includes(uid)

    // Atomic add/remove so concurrent clicks can't double-count.
    const update = already
      ? { $pull: { likes: uid, likeProfiles: { userId: uid } } }
      : {
          $addToSet: {
            likes: uid,
            likeProfiles: {
              userId: uid,
              name: session.user.name ?? 'Guest',
              avatar: session.user.image ?? undefined,
            },
          },
        }
    const updated = await GuestbookModel.findByIdAndUpdate(id, update, {
      new: true,
    }).select('likes likeProfiles')

    const newLikes: string[] = Array.isArray(updated?.likes) ? updated!.likes : []

    return NextResponse.json({
      success: true,
      likeCount: newLikes.length,
      likedByMe: !already,
      likeProfiles: Array.isArray(updated?.likeProfiles) ? updated.likeProfiles.slice(0, 3) : [],
    })
  } catch (error) {
    console.error('Guestbook like error:', error)
    return NextResponse.json({ error: 'Failed to update like.' }, { status: 500 })
  }
}
