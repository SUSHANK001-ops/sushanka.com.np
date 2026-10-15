import type { Metadata } from 'next'
import { caveat, kalam, patrickHand, reenie } from './fonts'
import MusafirWall from './MusafirWall'
import './musafir-cafe.css'

export const metadata: Metadata = {
  title: 'Musafir Cafe — the Promise Wall',
  description:
    'A warm cafe wall covered in handwritten notes from fellow travellers. Read the wall, then pin a promise of your own.',
}

// Detect whether the Google sign-in provider is available so the sign-in gate
// only offers what the server actually supports. The provider is registered in
// auth.ts only when its credentials are present (Google-only in this repo).
const showGoogle = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
)

export default function MusafirCafePage() {
  return (
    <div
      className={`musafir-wall-root ${caveat.variable} ${kalam.variable} ${patrickHand.variable} ${reenie.variable}`}
    >
      <MusafirWall showGoogle={showGoogle} />
    </div>
  )
}
