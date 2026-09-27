import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { requireAdminSession } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

/** PATCH — admin toggles hide/show on a reply. Body: { replyId, isHidden } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const replyId = String(body?.replyId ?? '')
    const isHidden = Boolean(body?.isHidden)
    if (!replyId) {
      return NextResponse.json({ error: 'Reply id is required.' }, { status: 400 })
    }

    await connectDB()
    const entry = await GuestbookModel.findById(id)
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    }
    const reply = entry.replies?.id(replyId)
    if (!reply) {
      return NextResponse.json({ error: 'Reply not found.' }, { status: 404 })
    }

    reply.isHidden = isHidden
    await entry.save()

    return NextResponse.json({ success: true, replyId, isHidden: reply.isHidden })
  } catch (error) {
    console.error('Admin reply PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update reply.' }, { status: 500 })
  }
}

/** DELETE — admin permanently removes any reply. Body: { replyId } */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const replyId = String(body?.replyId ?? '')
    if (!replyId) {
      return NextResponse.json({ error: 'Reply id is required.' }, { status: 400 })
    }

    await connectDB()
    const entry = await GuestbookModel.findById(id)
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    }
    const reply = entry.replies?.id(replyId)
    if (!reply) {
      return NextResponse.json({ error: 'Reply not found.' }, { status: 404 })
    }

    reply.deleteOne()
    await entry.save()

    return NextResponse.json({ success: true, replyId })
  } catch (error) {
    console.error('Admin reply DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete reply.' }, { status: 500 })
  }
}
