'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  H_WALL_HEIGHT,
  H_WALL_SEED_WIDTH,
  NOTE_W,
  NOTE_H,
  PHOTO_NOTE_H,
  V_WALL_SEED_HEIGHT,
  V_WALL_WIDTH,
} from '@/lib/notePlacement'
import { ToastProvider } from '../guestbook/ui'
import type { PublicNote } from './types'
import StickyNote from './components/StickyNote'
import { WallBackdropLayers, WallBackdropOverlays } from './components/WallBackdrop'
import WallProps, { PropClusterPlacement } from './components/WallProps'
import NoteModal from './components/NoteModal'
import Composer from './components/Composer'
import LeaveNoteButton from './components/LeaveNoteButton'
import { useMusafirSound } from './components/useMusafirSound'

const DESKTOP_QUERY = '(min-width: 1024px)'
const PAGE_LIMIT = 100
const CLUSTER_SPACING = 1800 // logical px between decorative prop clusters

// Strict total order (z_index, created_at, _id) ascending — DOM paint order.
function compareNotes(a: PublicNote, b: PublicNote): number {
  if (a.z_index !== b.z_index) return a.z_index - b.z_index
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function MusafirWallInner({ showGoogle }: { showGoogle: boolean }) {
  const { data: session } = useSession()

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const [notes, setNotes] = useState<PublicNote[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const [isDesktop, setIsDesktop] = useState(false)
  const [scale, setScale] = useState(1)
  const [viewRect, setViewRect] = useState<Rect>({ left: 0, top: 0, right: 0, bottom: 0 })

  const [openNote, setOpenNote] = useState<PublicNote | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [newNoteId, setNewNoteId] = useState<string | null>(null)
  const [pageMuted, setPageMuted] = useState(false)

  const { playLift, playStick } = useMusafirSound(pageMuted)

  // ---- Orientation ---------------------------------------------------------
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    const apply = () => setIsDesktop(mql.matches)
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [])

  // Read stored coordinates for the active orientation (NEVER recompute).
  const posOf = useCallback(
    (n: PublicNote): { x: number; y: number } =>
      isDesktop ? { x: n.pos_x, y: n.pos_y } : { x: n.pos_x_v, y: n.pos_y_v },
    [isDesktop]
  )

  // ---- Wall logical dimensions from stored coordinates ---------------------
  const wall = useMemo(() => {
    if (isDesktop) {
      let width = H_WALL_SEED_WIDTH
      for (const n of notes) {
        const h = n.photo_url != null ? PHOTO_NOTE_H : NOTE_H
        width = Math.max(width, n.pos_x + NOTE_W + 80)
        void h
      }
      return { width, height: H_WALL_HEIGHT }
    }
    let height = V_WALL_SEED_HEIGHT
    for (const n of notes) {
      const h = n.photo_url != null ? PHOTO_NOTE_H : NOTE_H
      height = Math.max(height, n.pos_y_v + h + 80)
    }
    return { width: V_WALL_WIDTH, height }
  }, [notes, isDesktop])

  // ---- Fetching ------------------------------------------------------------
  const fetchPage = useCallback(
    async (next: string | null, replace: boolean) => {
      try {
        if (replace) {
          setLoading(true)
          setError(false)
        } else {
          setLoadingMore(true)
        }
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) })
        if (next) params.set('cursor', next)
        const res = await fetch(`/api/musafir-cafe/notes?${params.toString()}`)
        if (!res.ok) throw new Error('fetch failed')
        const data: { notes: PublicNote[]; nextCursor: string | null; hasMore: boolean } =
          await res.json()
        setNotes((prev) => {
          if (replace) return data.notes
          const seen = new Set(prev.map((n) => n.id))
          return [...prev, ...data.notes.filter((n) => !seen.has(n.id))]
        })
        setCursor(data.nextCursor)
        setHasMore(data.hasMore)
      } catch {
        if (replace) setError(true)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchPage(null, true)
  }, [fetchPage])

  // ---- Viewport-rect cull (throttled with rAF) -----------------------------
  const rafPending = useRef(false)
  const recomputeView = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const s = scale || 1
    const left = vp.scrollLeft / s
    const top = vp.scrollTop / s
    const w = vp.clientWidth / s
    const h = vp.clientHeight / s
    // Overscan one screen in each direction.
    setViewRect({
      left: left - w,
      top: top - h,
      right: left + w * 2,
      bottom: top + h * 2,
    })
  }, [scale])

  const scheduleView = useCallback(() => {
    if (rafPending.current) return
    rafPending.current = true
    requestAnimationFrame(() => {
      rafPending.current = false
      recomputeView()
      // Infinite scroll toward the far edge.
      const vp = viewportRef.current
      if (vp && hasMore && !loadingMore) {
        if (isDesktop) {
          const nearEnd = vp.scrollLeft + vp.clientWidth >= vp.scrollWidth - vp.clientWidth
          if (nearEnd) fetchPage(cursor, false)
        } else {
          const nearEnd = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - vp.clientHeight
          if (nearEnd) fetchPage(cursor, false)
        }
      }
    })
  }, [recomputeView, hasMore, loadingMore, isDesktop, cursor, fetchPage])

  // ---- Scale the whole canvas to fit (MEDIUM fix 4 for desktop) ------------
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const measure = () => {
      if (isDesktop) {
        // Fit logical H_WALL_HEIGHT into the viewport height (not raw 100vh).
        setScale(vp.clientHeight / H_WALL_HEIGHT)
      } else {
        // Fit the logical V_WALL_WIDTH column into the viewport width.
        setScale(vp.clientWidth / V_WALL_WIDTH)
      }
      recomputeView()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [isDesktop, recomputeView])

  useEffect(() => {
    recomputeView()
  }, [notes, wall, recomputeView])

  // ---- Wheel -> horizontal scroll (desktop) --------------------------------
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp || !isDesktop) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return // shift+wheel already produces deltaX — pass through
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      vp.scrollLeft += delta
      e.preventDefault()
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [isDesktop])

  // ---- Drag-to-pan (desktop); <5px = click -------------------------------
  const drag = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isDesktop) return
    const target = e.target as HTMLElement
    // Ignore drags starting on a note or an interactive prop.
    if (target.closest('.mz-note') || target.closest('button') || target.closest('a')) return
    const vp = viewportRef.current
    if (!vp) return
    drag.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      moved: false,
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const vp = viewportRef.current
    if (!d?.active || !vp) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) + Math.abs(dy) >= 5) d.moved = true
    vp.scrollLeft = d.scrollLeft - dx
    vp.scrollTop = d.scrollTop - dy
  }
  const endDrag = () => {
    if (drag.current) drag.current.active = false
  }

  // ---- Arrow buttons -------------------------------------------------------
  const scrollByArrow = (dir: -1 | 1) => {
    const vp = viewportRef.current
    if (!vp) return
    vp.scrollBy({ left: dir * vp.clientWidth * 0.8, behavior: 'smooth' })
  }

  // ---- Visible notes: cull + sort by comparator ----------------------------
  const visibleNotes = useMemo(() => {
    const vis = notes.filter((n) => {
      const { x, y } = posOf(n)
      const h = n.photo_url != null ? PHOTO_NOTE_H : NOTE_H
      return x + NOTE_W >= viewRect.left && x <= viewRect.right && y + h >= viewRect.top && y <= viewRect.bottom
    })
    return vis.sort(compareNotes)
  }, [notes, posOf, viewRect])

  // ---- Prop clusters: only those near the viewport -------------------------
  const clusters = useMemo<PropClusterPlacement[]>(() => {
    const out: PropClusterPlacement[] = []
    if (isDesktop) {
      const count = Math.ceil(wall.width / CLUSTER_SPACING) + 1
      for (let i = 0; i < count; i++) {
        const left = i * CLUSTER_SPACING + 120
        if (left + 520 >= viewRect.left && left <= viewRect.right) {
          out.push({ index: i, left, top: 90 })
        }
      }
    } else {
      const count = Math.ceil(wall.height / CLUSTER_SPACING) + 1
      for (let i = 0; i < count; i++) {
        const top = i * CLUSTER_SPACING + 120
        if (top + 520 >= viewRect.top && top <= viewRect.bottom) {
          out.push({ index: i, left: 20, top })
        }
      }
    }
    return out
  }, [isDesktop, wall, viewRect])

  // ---- New-note insert: pan into view, slap + glow -------------------------
  const handlePosted = useCallback(
    (note: PublicNote) => {
      setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [note, ...prev]))
      setNewNoteId(note.id)
      playStick()
      // Pan into view after layout settles.
      requestAnimationFrame(() => {
        const vp = viewportRef.current
        if (!vp) return
        const { x, y } = isDesktop ? { x: note.pos_x, y: note.pos_y } : { x: note.pos_x_v, y: note.pos_y_v }
        const s = scale || 1
        if (isDesktop) {
          vp.scrollTo({ left: Math.max(0, x * s - vp.clientWidth / 2), behavior: 'smooth' })
        } else {
          vp.scrollTo({ top: Math.max(0, y * s - vp.clientHeight / 2), behavior: 'smooth' })
        }
      })
      // Remove the glow class after a few seconds.
      window.setTimeout(() => setNewNoteId((cur) => (cur === note.id ? null : cur)), 4000)
    },
    [isDesktop, scale, playStick]
  )

  const handleDeleted = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const defaultName = session?.user?.name ?? ''

  return (
    <div className="mz-shell">
      <WallBackdropOverlays />

      {/* Page-level mute toggle. */}
      <button
        type="button"
        className="mz-mute"
        aria-label={pageMuted ? 'Unmute wall sounds' : 'Mute wall sounds'}
        aria-pressed={pageMuted}
        onClick={() => setPageMuted((m) => !m)}
      >
        {pageMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <div
        ref={viewportRef}
        className={`mz-viewport ${isDesktop ? 'mz-viewport--h' : 'mz-viewport--v'}`}
        onScroll={scheduleView}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          ref={canvasRef}
          className="mz-canvas"
          style={{
            width: `${wall.width * scale}px`,
            height: `${wall.height * scale}px`,
          }}
        >
          <div
            className="mz-canvas-logical"
            style={{
              width: `${wall.width}px`,
              height: `${wall.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <WallBackdropLayers />
            <WallProps clusters={clusters} />

            {!loading && !error && notes.length === 0 && (
              <div className="mz-empty">The wall is waiting for its first story.</div>
            )}

            {visibleNotes.map((n) => {
              // Render at the active-orientation stored coordinates.
              const { x, y } = posOf(n)
              const rendered: PublicNote = { ...n, pos_x: x, pos_y: y }
              return (
                <StickyNote
                  key={n.id}
                  note={rendered}
                  isNew={n.id === newNoteId}
                  onOpen={setOpenNote}
                />
              )
            })}
          </div>
        </div>
      </div>

      {loading && (
        <div className="mz-skeleton" role="status" aria-live="polite">
          <span className="mz-skeleton__dot" />
          <span className="mz-skeleton__dot" />
          <span className="mz-skeleton__dot" />
          <span className="mz-sr-only">Dusting off the wall…</span>
        </div>
      )}

      {error && (
        <div className="mz-error" role="alert">
          <p>Couldn’t reach the wall.</p>
          <button type="button" className="mz-btn mz-btn--primary" onClick={() => fetchPage(null, true)}>
            Try again
          </button>
        </div>
      )}

      {isDesktop && (
        <div className="mz-arrows" aria-hidden="false">
          <button type="button" className="mz-arrow" aria-label="Scroll left" onClick={() => scrollByArrow(-1)}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="mz-arrow" aria-label="Scroll right" onClick={() => scrollByArrow(1)}>
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <LeaveNoteButton showGoogle={showGoogle} onCompose={() => setComposerOpen(true)} />

      {composerOpen && (
        <Composer
          defaultName={defaultName}
          onClose={() => setComposerOpen(false)}
          onPosted={handlePosted}
        />
      )}

      {openNote && (
        <NoteModal
          note={openNote}
          onClose={() => setOpenNote(null)}
          onDeleted={handleDeleted}
          onLift={playLift}
        />
      )}
    </div>
  )
}

export default function MusafirWall({ showGoogle }: { showGoogle: boolean }) {
  // ToastProvider wraps the wall so the composer's useToast works even though
  // this page lives outside the guestbook's own provider.
  return (
    <ToastProvider>
      <MusafirWallInner showGoogle={showGoogle} />
    </ToastProvider>
  )
}
