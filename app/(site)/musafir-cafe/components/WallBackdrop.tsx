'use client'
import React from 'react'

/**
 * The layered wall backdrop.
 *
 * The wood base (z0), wire-mesh grid (z1), top beam + floor strip (z2) are
 * rendered as CANVAS children (passed in as `children` of .mz-canvas by
 * MusafirWall) so they stretch across the full scrollable wall.
 *
 * The sunlight sweep (opacity <= 0.18) and edge vignette are position:fixed,
 * pointer-events:none overlays scoped inside .musafir-wall-root so they track
 * the viewport rather than scrolling with the giant canvas, and never block
 * interaction or reduce note readability.
 */

// Canvas-child layers: wood / mesh / beam / floor. Stretched to the full canvas.
export function WallBackdropLayers() {
  return (
    <>
      <div className="mz-wall-wood" aria-hidden="true" />
      <div className="mz-wall-mesh" aria-hidden="true" />
      <div className="mz-beam" aria-hidden="true" />
      <div className="mz-floor" aria-hidden="true" />
    </>
  )
}

// Viewport-fixed overlays: golden sunlight sweep + vignette. Never interactive.
export function WallBackdropOverlays() {
  return (
    <>
      <div className="mz-light" aria-hidden="true" />
      <div className="mz-vignette" aria-hidden="true" />
    </>
  )
}

export default WallBackdropLayers
