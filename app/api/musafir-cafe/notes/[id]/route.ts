import { NextRequest, NextResponse } from 'next/server'

import cloudinary from '@/lib/cloudinary'
import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'
import { getPromiseNoteModel } from '@/model/promiseNoteModel'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/musafir-cafe/notes/[id] — owner-only hard delete. Also best-effort
 * cleans up the note's Cloudinary assets (drawing + photo).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Take a seat first.' }, { status: 401 })
    }

    const uid = userKey(session)
    if (!uid) {
      return NextResponse.json({ error: 'Take a seat first.' }, { status: 401 })
    }

    const { id } = await params

    const Model = await getPromiseNoteModel()
    const note = await Model.findById(id)
    if (!note) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    // Ownership is checked against the privately stored user_id using the
    // guarded uid (guaranteed non-empty), never anything from the client.
    if (note.user_id !== uid) {
      return NextResponse.json(
        { error: 'You can only take down your own notes.' },
        { status: 403 }
      )
    }

    await note.deleteOne()

    // Best-effort Cloudinary cleanup. The note is already gone; a dangling asset
    // is acceptable, so failures are logged and swallowed.
    for (const publicId of [note.drawing_public_id, note.photo_public_id]) {
      if (!publicId) continue
      try {
        await cloudinary.uploader.destroy(publicId)
      } catch (destroyError) {
        console.error('Musafir Cafe asset cleanup error:', destroyError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Musafir Cafe notes DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove your note.' }, { status: 500 })
  }
}
