import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { userKey } from '@/lib/userKey'
import { rateLimit } from '@/lib/rateLimit'
import { getPromiseNoteModel } from '@/model/promiseNoteModel'

export const dynamic = 'force-dynamic'

/**
 * POST /api/musafir-cafe/notes/[id]/report — flag a note. Auth required.
 *
 * MEDIUM fix 1: the per-user/per-note dedup limiter is consulted BEFORE any
 * $inc, so a single user can never drive report_count up on repeat calls.
 * NIT #7: no redundant findById — findOneAndUpdate's result is the 404 guard.
 * The count is never revealed to the client.
 */
export async function POST(
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

    // Dedup BEFORE the increment: one report per user per note per day. If the
    // limiter denies, we return success without re-incrementing and without
    // revealing the dedup to the client.
    const rl = await rateLimit('musafir-report', `${uid}:${id}`, 1, 86400)
    if (!rl.allowed) {
      return NextResponse.json({ success: true })
    }

    const Model = await getPromiseNoteModel()
    const updated = await Model.findOneAndUpdate(
      { _id: id },
      { $inc: { report_count: 1 } },
      { new: true }
    )
    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    // Auto-hide once enough reports accumulate; GET's status:'visible' filter
    // then excludes it.
    if (updated.report_count >= 5 && updated.status === 'visible') {
      updated.status = 'hidden'
      await updated.save()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Musafir Cafe report error:', error)
    return NextResponse.json({ error: 'Failed to report this note.' }, { status: 500 })
  }
}
