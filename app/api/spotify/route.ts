import { NextResponse } from 'next/server'

/**
 * ============================================================================
 *  Spotify "Now Playing" — dashboard widget.
 * ============================================================================
 *
 *  SETUP (one-time):
 *  1. Create an app at https://developer.spotify.com/dashboard
 *     Add redirect URI: http://localhost:3000/callback
 *  2. Grab the Client ID and Client Secret.
 *  3. Get a refresh token with the `user-read-currently-playing` and
 *     `user-read-recently-played` scopes (use the auth-code flow once).
 *  4. Add these to your environment (.env.local / Vercel project settings):
 *        SPOTIFY_CLIENT_ID=...
 *        SPOTIFY_CLIENT_SECRET=...
 *        SPOTIFY_REFRESH_TOKEN=...
 *
 *  Until those are set, this route returns { configured: false } and the
 *  dashboard card shows a graceful "Not currently playing" fallback.
 * ============================================================================
 */

export const revalidate = 0 // always fresh — it's "now playing"

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing'
const RECENT_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1'

interface SpotifyTrack {
  name: string
  artist: string
  albumArt: string | null
  url: string | null
}

/**
 * Small in-memory access-token cache. Spotify access tokens live ~1h, so we
 * reuse one across requests instead of hitting the token endpoint every poll.
 */
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return null

  // A refresh token is a long opaque string. A stray placeholder like "180"
  // can never work, so skip the network round-trip and report unconfigured.
  if (SPOTIFY_REFRESH_TOKEN.length < 20) return null

  // Reuse a still-valid cached token (60s safety margin).
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    cachedToken = null
    return null
  }
  const data = await res.json()
  if (!data.access_token) return null

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  }
  return cachedToken.value
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTrack(item: any): SpotifyTrack {
  return {
    name: item?.name ?? 'Unknown',
    artist: (item?.artists ?? []).map((a: any) => a.name).join(', ') || 'Unknown',
    albumArt: item?.album?.images?.[0]?.url ?? null,
    url: item?.external_urls?.spotify ?? null,
  }
}

export async function GET() {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ configured: false, isPlaying: false })
  }

  try {
    // Currently playing?
    const nowRes = await fetch(NOW_PLAYING_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (nowRes.status === 200) {
      const data = await nowRes.json()
      if (data?.item) {
        return NextResponse.json({
          configured: true,
          isPlaying: Boolean(data.is_playing),
          track: mapTrack(data.item),
        })
      }
    }

    // Spotify's player endpoints require the app owner's account to have
    // Premium; a free account gets 403 here. Surface that distinctly so the
    // card can show an honest message instead of a misleading "not playing".
    if (nowRes.status === 403) {
      return NextResponse.json({ configured: true, isPlaying: false, premiumRequired: true })
    }

    // Fall back to the most recently played track.
    const recentRes = await fetch(RECENT_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (recentRes.ok) {
      const data = await recentRes.json()
      const item = data?.items?.[0]?.track
      if (item) {
        return NextResponse.json({
          configured: true,
          isPlaying: false,
          track: mapTrack(item),
        })
      }
    }
    if (recentRes.status === 403) {
      return NextResponse.json({ configured: true, isPlaying: false, premiumRequired: true })
    }

    return NextResponse.json({ configured: true, isPlaying: false })
  } catch (error) {
    console.error('Spotify dashboard error:', error)
    return NextResponse.json({ configured: true, isPlaying: false })
  }
}
