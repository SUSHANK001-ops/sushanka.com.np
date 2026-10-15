import { NextRequest, NextResponse } from 'next/server'
import cloudinary from '@/lib/cloudinary'
import { auth } from '@/auth'
import { getClientIp, rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB (photos; drawing PNGs are well under this)
// A single accept list covers both tabs: drawings export as PNG, photos are
// WebP/JPEG/PNG — no separate drawing exception needed.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

/** POST — upload a Promise Wall image (drawing PNG or photo). Requires a signed-in visitor. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to upload an image.' }, { status: 401 })
    }

    // Light rate limit so nobody hammers the uploader.
    const ip = getClientIp(req)
    const rl = await rateLimit('musafir-upload', ip, 12, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 5MB).' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

    const result = await cloudinary.uploader.upload(base64, {
      folder: 'musafir-cafe',
      resource_type: 'image',
      transformation: [{ width: 1200, crop: 'limit' }],
    })

    return NextResponse.json(
      { url: result.secure_url, publicId: result.public_id },
      { status: 200 }
    )
  } catch (error) {
    console.error('Musafir Cafe upload error:', error)
    return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 })
  }
}
