// Handwriting faces for the Musafir Cafe Promise Wall.
//
// Loaded via next/font/google ONLY — self-hosted at build and served from
// 'self', which satisfies the site CSP (font-src 'self' data:; no
// fonts.googleapis.com / fonts.gstatic.com allowlisted). A Google Fonts
// <link>/@import would be CSP-blocked and silently fail.
//
// Each face exposes a page-local --mz-* CSS variable so musafir-cafe.css can
// map the note `font` enum to a face without leaking typography to other pages.
import { Caveat, Kalam, Patrick_Hand, Reenie_Beanie } from 'next/font/google'

export const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--mz-caveat',
  display: 'swap',
})

export const kalam = Kalam({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--mz-kalam',
  display: 'swap',
})

export const patrickHand = Patrick_Hand({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--mz-patrick',
  display: 'swap',
})

export const reenie = Reenie_Beanie({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--mz-reenie',
  display: 'swap',
})
