import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import GuestbookModel from '@/model/guestbookModel'
import { requireAdminSession } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

/** GET — ALL guestbook entries (including hidden), for admin moderation. */
export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await connectDB()
    const entries = await GuestbookModel.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .select('name message avatar provider userId isAdmin image isHidden likes replies createdAt updatedAt')
      .lean()

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('Admin guestbook GET error:', error)
    return NextResponse.json({ error: 'Failed to load entries.' }, { status: 500 })
  }
}
