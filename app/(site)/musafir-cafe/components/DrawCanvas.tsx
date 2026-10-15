'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'

export type DrawTool = 'pen' | 'marker' | 'eraser'

export const DRAW_INKS = [
  '#1b2a4a', // deep blue
  '#111111', // near-black
  '#5a3a22', // brown
  '#b23b3b', // warm red
  '#2f7d4f', // green
  '#d98a2b', // amber
  '#7a4fb0', // violet
  '#e86aa6', // pink
] as const

export const DRAW_SIZES = [3, 6, 11] as const

interface Point {
  x: number
  y: number
}

interface Stroke {
  tool: DrawTool
  color: string
  size: number
  points: Point[]
}

// ---- Pure helpers ----------------------------------------------------------

// Resolve the effective line settings for a stroke's tool.
export function strokeStyleFor(stroke: Stroke): {
  stroke: string
  width: number
  alpha: number
  composite: GlobalCompositeOperation
} {
  if (stroke.tool === 'eraser') {
    return {
      stroke: '#000',
      width: stroke.size * 2.5,
      alpha: 1,
      composite: 'destination-out',
    }
  }
  if (stroke.tool === 'marker') {
    return { stroke: stroke.color, width: stroke.size * 2, alpha: 0.4, composite: 'source-over' }
  }
  return { stroke: stroke.color, width: stroke.size, alpha: 1, composite: 'source-over' }
}

// Point relative to the canvas element, mapped to the canvas's drawing buffer.
export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  rect: DOMRect,
  canvasW: number,
  canvasH: number
): Point {
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvasW,
    y: ((e.clientY - rect.top) / rect.height) * canvasH,
  }
}

interface DrawCanvasProps {
  onChange: (dataUrl: string | null) => void
}

const CANVAS_W = 600
const CANVAS_H = 600

/**
 * A transparent drawing surface. Pointer Events (with setPointerCapture) so
 * finger / stylus / mouse all draw; touch-action:none keeps scrolling from
 * stealing the gesture. Tools: pen, marker (wider, semi-transparent), eraser
 * (destination-out). Undo/redo over a stroke list, plus clear. Export is a
 * transparent PNG via canvas.toBlob('image/png') -> object URL preview.
 */
export default function DrawCanvas({ onChange }: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState<string>(DRAW_INKS[0])
  const [size, setSize] = useState<number>(DRAW_SIZES[1])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])

  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const prevUrl = useRef<string | null>(null)

  // Repaint the whole canvas from the stroke list.
  const repaint = useCallback((list: Stroke[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of list) {
      if (stroke.points.length === 0) continue
      const s = strokeStyleFor(stroke)
      ctx.globalCompositeOperation = s.composite
      ctx.globalAlpha = s.alpha
      ctx.strokeStyle = s.stroke
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      if (stroke.points.length === 1) {
        // A single tap — draw a dot.
        ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01)
      }
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }, [])

  // Export the current canvas as a transparent PNG object URL.
  const emit = useCallback(
    (list: Stroke[]) => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (list.length === 0) {
        if (prevUrl.current) {
          URL.revokeObjectURL(prevUrl.current)
          prevUrl.current = null
        }
        onChange(null)
        return
      }
      canvas.toBlob((blob) => {
        if (!blob) return
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
        const url = URL.createObjectURL(blob)
        prevUrl.current = url
        onChange(url)
      }, 'image/png')
    },
    [onChange]
  )

  useEffect(() => {
    repaint(strokes)
  }, [strokes, repaint])

  useEffect(() => {
    return () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    const rect = canvas.getBoundingClientRect()
    const pt = pointerToCanvas(e, rect, canvas.width, canvas.height)
    current.current = { tool, color, size, points: [pt] }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !current.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const pt = pointerToCanvas(e, rect, canvas.width, canvas.height)
    current.current.points.push(pt)
    // Live-draw just the current stroke on top for responsiveness.
    repaint([...strokes, current.current])
  }

  const endStroke = () => {
    if (!drawing.current || !current.current) return
    drawing.current = false
    const finished = current.current
    current.current = null
    const next = [...strokes, finished]
    setStrokes(next)
    setRedoStack([])
    emit(next)
  }

  const undo = () => {
    if (strokes.length === 0) return
    const next = strokes.slice(0, -1)
    const popped = strokes[strokes.length - 1]
    setStrokes(next)
    setRedoStack((r) => [...r, popped])
    emit(next)
  }

  const redo = () => {
    if (redoStack.length === 0) return
    const restored = redoStack[redoStack.length - 1]
    const next = [...strokes, restored]
    setStrokes(next)
    setRedoStack((r) => r.slice(0, -1))
    emit(next)
  }

  const clear = () => {
    setStrokes([])
    setRedoStack([])
    emit([])
  }

  return (
    <div className="mz-draw">
      <div className="mz-draw__tools" role="toolbar" aria-label="Drawing tools">
        {(['pen', 'marker', 'eraser'] as DrawTool[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`mz-draw__tool ${tool === t ? 'is-active' : ''}`}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
          >
            {t}
          </button>
        ))}
        <span className="mz-draw__sep" aria-hidden="true" />
        <div className="mz-draw__inks">
          {DRAW_INKS.map((c) => (
            <button
              key={c}
              type="button"
              className={`mz-draw__ink ${color === c ? 'is-active' : ''}`}
              style={{ background: c }}
              aria-label={`Ink ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <span className="mz-draw__sep" aria-hidden="true" />
        <div className="mz-draw__sizes">
          {DRAW_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`mz-draw__size ${size === s ? 'is-active' : ''}`}
              aria-label={`Brush size ${s}`}
              aria-pressed={size === s}
              onClick={() => setSize(s)}
            >
              <span style={{ width: s + 2, height: s + 2 }} />
            </button>
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="mz-draw__canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />

      <div className="mz-draw__actions">
        <button type="button" className="mz-btn mz-btn--quiet" onClick={undo} disabled={strokes.length === 0}>
          Undo
        </button>
        <button type="button" className="mz-btn mz-btn--quiet" onClick={redo} disabled={redoStack.length === 0}>
          Redo
        </button>
        <button type="button" className="mz-btn mz-btn--quiet" onClick={clear} disabled={strokes.length === 0}>
          Clear
        </button>
      </div>
    </div>
  )
}
