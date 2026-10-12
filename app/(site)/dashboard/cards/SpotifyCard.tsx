'use client'
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Music } from 'lucide-react'

interface SpotifyState {
  configured: boolean
  isPlaying: boolean
  premiumRequired?: boolean
  track?: { name: string; artist: string; albumArt: string | null; url: string | null }
}

const SpotifyCard = () => {
  const [state, setState] = useState<SpotifyState | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/spotify')
        .then((r) => r.json())
        .then(setState)
        .catch(() => setState({ configured: false, isPlaying: false }))
    load()
    const id = setInterval(load, 30000) // refresh every 30s
    return () => clearInterval(id)
  }, [])

  const track = state?.track
  const playing = state?.isPlaying

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6">
      <div className="mb-5 flex items-center gap-2 text-muted">
        <Music size={16} />
        <span className="font-mono text-xs uppercase tracking-widest">
          {playing ? 'Now Playing' : 'Last Played'}
        </span>
        {playing && (
          <span className="pulse-dot relative ml-1 inline-block h-2 w-2 rounded-full bg-accent" />
        )}
      </div>

      {track ? (
        <a
          href={track.url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4"
        >
          {track.albumArt ? (
            <Image
              src={track.albumArt}
              alt={track.name}
              width={56}
              height={56}
              className="h-14 w-14 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border">
              <Music size={20} className="text-muted" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
              {track.name}
            </p>
            <p className="truncate text-xs text-muted">{track.artist}</p>
          </div>
        </a>
      ) : (
        <div>
          <p className="text-sm text-muted">
            {state?.premiumRequired ? 'Live track hidden' : 'Not currently playing'}
          </p>
          {state && !state.configured && (
            <p className="mt-2 font-mono text-[10px] text-muted/70">
              Spotify not configured
            </p>
          )}
          {state?.premiumRequired && (
            <p className="mt-2 font-mono text-[10px] text-muted/70">
              Now-playing needs Spotify Premium
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default SpotifyCard
