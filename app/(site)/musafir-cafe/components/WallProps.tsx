'use client'
import React from 'react'
import RulesMailbox from './RulesMailbox'

/**
 * Decorative prop clusters, rendered behind the notes at z-index:3.
 *
 * MusafirWall decides which cluster indices are near the viewport (shared cull)
 * and renders only those, so a 50-screen-wide wall never mounts every cluster.
 *
 * Every prop is aria-hidden + pointer-events:none EXCEPT the rules mailbox,
 * which is the single interactive decorative element (a real <button>). The
 * cluster also carries a second, purely decorative mailbox house.
 */

export interface PropClusterPlacement {
  index: number
  // top-left of the cluster in canvas (logical) coordinates
  left: number
  top: number
}

// A warm, generic traveller-cafe tagline for the hanging sign. No real place.
const SIGN_TAGLINE = 'rest your feet, leave a promise'

function PropCluster({ placement }: { placement: PropClusterPlacement }) {
  // Only the first cluster carries the single interactive rules mailbox so the
  // tab order stays short regardless of how many clusters mount.
  const withRules = placement.index === 0
  return (
    <div
      className="mz-prop-cluster"
      style={{ left: `${placement.left}px`, top: `${placement.top}px` }}
    >
      {/* Hanging fairy lights across the top of the cluster. */}
      <div className="mz-prop-lights" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className={`mz-prop-bulb mz-prop-bulb--${i % 4}`} />
        ))}
      </div>

      {/* Hanging wooden "Musafir Cafe" sign with a warm generic tagline. */}
      <div className="mz-prop-sign" aria-hidden="true">
        <span className="mz-prop-sign__name">Musafir Cafe</span>
        <span className="mz-prop-sign__tag">{SIGN_TAGLINE}</span>
      </div>

      {/* The interactive rules mailbox (first cluster only) + a decorative one. */}
      {withRules ? (
        <div className="mz-prop-mailboxes">
          <RulesMailbox />
          <div className="mz-prop-mailbox mz-prop-mailbox--deco" aria-hidden="true">
            <span className="mz-prop-mailbox__flag" />
            <span className="mz-prop-mailbox__slot" />
          </div>
        </div>
      ) : (
        <div className="mz-prop-mailboxes" aria-hidden="true">
          <div className="mz-prop-mailbox mz-prop-mailbox--deco">
            <span className="mz-prop-mailbox__flag" />
            <span className="mz-prop-mailbox__slot" />
          </div>
          <div className="mz-prop-mailbox mz-prop-mailbox--deco">
            <span className="mz-prop-mailbox__flag" />
            <span className="mz-prop-mailbox__slot" />
          </div>
        </div>
      )}

      {/* Rustic drawer cabinet with a pen cup on top (hints at the draw tool). */}
      <div className="mz-prop-cabinet" aria-hidden="true">
        <span className="mz-prop-cabinet__drawer" />
        <span className="mz-prop-cabinet__drawer" />
        <span className="mz-prop-pencup">
          <span className="mz-prop-pen mz-prop-pen--0" />
          <span className="mz-prop-pen mz-prop-pen--1" />
          <span className="mz-prop-pen mz-prop-pen--2" />
        </span>
      </div>

      {/* Potted plant. */}
      <div className="mz-prop-plant" aria-hidden="true">
        <span className="mz-prop-plant__leaf mz-prop-plant__leaf--a" />
        <span className="mz-prop-plant__leaf mz-prop-plant__leaf--b" />
        <span className="mz-prop-plant__leaf mz-prop-plant__leaf--c" />
        <span className="mz-prop-plant__pot" />
      </div>

      {/* Scattered push-pins and washi-tape (decorative, distinct from notes). */}
      <span className="mz-prop-pin mz-prop-pin--a" aria-hidden="true" />
      <span className="mz-prop-pin mz-prop-pin--b" aria-hidden="true" />
      <span className="mz-prop-washi mz-prop-washi--a" aria-hidden="true" />
      <span className="mz-prop-washi mz-prop-washi--b" aria-hidden="true" />

      {/* Tiny chalkboard. */}
      <div className="mz-prop-chalkboard" aria-hidden="true">
        <span className="mz-prop-chalkboard__text">Leave a promise</span>
      </div>
    </div>
  )
}

export default function WallProps({
  clusters,
}: {
  clusters: PropClusterPlacement[]
}) {
  return (
    <div className="mz-props">
      {clusters.map((c) => (
        <PropCluster key={c.index} placement={c} />
      ))}
    </div>
  )
}
