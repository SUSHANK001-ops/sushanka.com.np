'use client'
import { useCallback } from 'react'
import useSound from 'use-sound'
import { useSoundFx } from '@/app/ui/sound/SoundProvider'

/**
 * Page sound for the wall, with graceful degradation.
 *
 * Gated by BOTH the site-wide `useSoundFx().enabled` preference AND a
 * page-level mute (`pageMuted`). The audio assets paper-lift.mp3 /
 * paper-stick.mp3 do NOT exist yet — if a file is absent `use-sound` simply
 * fails to load and `play()` is a no-op; nothing throws and nothing crashes.
 *
 * `prefers-reduced-motion` is handled by the CSS/animation layer, not here —
 * motion is not sound.
 */
export function useMusafirSound(pageMuted: boolean) {
  const { enabled } = useSoundFx()
  const soundEnabled = enabled && !pageMuted

  // Missing files resolve to a disabled sprite; play becomes a safe no-op.
  const [playLiftRaw] = useSound('/sounds/paper-lift.mp3', {
    volume: 0.3,
    soundEnabled,
  })
  const [playStickRaw] = useSound('/sounds/paper-stick.mp3', {
    volume: 0.35,
    soundEnabled,
  })

  const playLift = useCallback(() => {
    if (!soundEnabled) return
    try {
      playLiftRaw()
    } catch {
      /* absent file / playback error — stay silent, never crash */
    }
  }, [soundEnabled, playLiftRaw])

  const playStick = useCallback(() => {
    if (!soundEnabled) return
    try {
      playStickRaw()
    } catch {
      /* absent file / playback error — stay silent, never crash */
    }
  }, [soundEnabled, playStickRaw])

  return { playLift, playStick }
}
