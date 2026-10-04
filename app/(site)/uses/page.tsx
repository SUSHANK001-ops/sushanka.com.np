import React from 'react'
import type { Metadata } from 'next'
import UsesView from './UsesView'

export const metadata: Metadata = {
  title: 'Uses · Sushanka Lamichhane',
  description:
    'A curated collection of the hardware, software, dev tools, and daily apps I use to build projects, stream music, and stay productive.',
}

export default function UsesPage() {
  return (
    <div className="editorial-page pt-32 pb-20 md:pt-36">
      <p className="eyebrow eyebrow-dot mb-3">What I work with</p>
      <h1 className="display-serif text-4xl text-foreground md:text-5xl">Uses</h1>
      <p className="mt-4 max-w-xl text-[0.975rem] leading-relaxed text-muted">
        A curated collection of the hardware, software, dev tools, and daily
        apps I use to build projects, stream music, and stay productive.
      </p>

      <UsesView />
    </div>
  )
}
