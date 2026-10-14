// lib/notePlacement.ts — the single source of truth for note geometry.
// Pure, dependency-free, deterministic. In practice only the server calls this,
// running it twice per create (horizontal + vertical) against the current
// visible set so each orientation independently satisfies the 35% per-note cap
// and the 60% cumulative-visibility rule.

// ---- Logical placement constants (Finding #4 / #3) -------------------------
export const NOTE_W = 160          // logical px, all notes
export const NOTE_H = 160          // logical px, text/drawing notes
export const PHOTO_NOTE_H = 210    // logical px, photo (polaroid) notes are taller
export const V_WALL_WIDTH = 420    // logical px, fixed mobile column width (pagination-independent)
export const H_WALL_HEIGHT = 900   // logical px, fixed horizontal canvas height (device-independent)
export const H_WALL_SEED_WIDTH = 2400  // logical px, horizontal pass seed width
export const V_WALL_SEED_HEIGHT = 2000 // logical px, vertical pass seed height
export const GROWTH_STEP = 1200    // logical px, monotonic wall growth per extension
export const Z_CAP = 9000          // z_index ceiling

export type Orientation = 'horizontal' | 'vertical'

export interface PlacedNote { pos_x: number; pos_y: number; rotation: number }
export interface ExistingNote {
  pos_x: number
  pos_y: number
  w: number
  h: number
  // Stacking total-order keys (Finding #3). All existing notes stack BELOW the
  // incoming note at insertion time, so these are only needed by callers that
  // re-validate the cumulative rule across the full set.
  z_index?: number
  created_at?: number
  id?: string
}

export interface PlaceInput {
  existing: ExistingNote[]      // currently-visible notes with their boxes
  noteW: number; noteH: number  // the new note's size (photo notes taller)
  wall: { width: number; height: number }
  orientation: Orientation
  seed: number                  // derived from note id -> deterministic jitter
}

export interface PlaceResult {
  placement: PlacedNote
  wall: { width: number; height: number }   // possibly grown (monotonic)
}

// ---- Seeded PRNG -----------------------------------------------------------
// mulberry32 over `seed` backs every random choice so results are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 32-bit hash of a hex string (the note's Mongo _id) -> deterministic seed.
export function seedFromId(idHex: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < idHex.length; i++) {
    h ^= idHex.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ---- Geometry helpers ------------------------------------------------------

// Picks the box for a given note. isPhoto = Boolean(photo_url) is the ONLY
// height-determining flag (MEDIUM fix 2), identical at placement and render.
export function noteBox(isPhoto: boolean): { w: number; h: number } {
  return { w: NOTE_W, h: isPhoto ? PHOTO_NOTE_H : NOTE_H }
}

// inflate (w,h) to the AABB of the rectangle rotated by `deg`, centered.
// w' = w·cosθ + h·sinθ, h' = w·sinθ + h·cosθ.
export function rotatedAABB(w: number, h: number, deg: number): { w: number; h: number } {
  const t = (Math.abs(deg) * Math.PI) / 180
  return { w: w * Math.cos(t) + h * Math.sin(t), h: w * Math.sin(t) + h * Math.cos(t) }
}

export interface Box { pos_x: number; pos_y: number; w: number; h: number }

// Overlap area between two axis-aligned boxes.
function overlapArea(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.pos_x + a.w, b.pos_x + b.w) - Math.max(a.pos_x, b.pos_x))
  const oy = Math.max(0, Math.min(a.pos_y + a.h, b.pos_y + b.h) - Math.max(a.pos_y, b.pos_y))
  return ox * oy
}

// Returns the fraction (0..1) of A's area covered by the UNION of the given
// higher-z boxes, approximated on a fixed 10x10 grid (1% cells). A cell counts
// as covered if its CENTER lies inside any higher-z box.
// MEDIUM fix 5: callers pass the rotation-inflated, RECENTRED box
// { pos_x: cx - w'/2, pos_y: cy - h'/2, w: w', h: h' } for A AND every higher-z box.
export function coveredFraction(A: Box, higherZBoxes: Box[]): number {
  const cellW = A.w / 10
  const cellH = A.h / 10
  let covered = 0
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      const cx = A.pos_x + (i + 0.5) * cellW
      const cy = A.pos_y + (j + 0.5) * cellH
      for (const b of higherZBoxes) {
        if (cx >= b.pos_x && cx <= b.pos_x + b.w && cy >= b.pos_y && cy <= b.pos_y + b.h) {
          covered++
          break
        }
      }
    }
  }
  return covered / 100
}

// ---- Placement -------------------------------------------------------------

// Build the rotation-inflated, recentred box for a note whose top-left box and
// rotation are known. Exported so callers (the POST route) build existing-note
// boxes exactly as placeNote expects them (MEDIUM fix 5).
export function inflatedBox(
  pos_x: number,
  pos_y: number,
  w: number,
  h: number,
  rotation: number
): Box {
  const cx = pos_x + w / 2
  const cy = pos_y + h / 2
  const infl = rotatedAABB(w, h, rotation)
  return { pos_x: cx - infl.w / 2, pos_y: cy - infl.h / 2, w: infl.w, h: infl.h }
}

export function placeNote(input: PlaceInput): PlaceResult {
  const { existing, noteW, noteH, orientation, seed } = input
  const rand = mulberry32(seed)

  // rotation decided once (shared across orientations by the caller passing the
  // same seed); seeded in [-6, +6].
  const rotation = Math.round((rand() * 12 - 6) * 1000) / 1000

  const cellW = noteW * 1.1
  const cellH = noteH * 1.1

  // Pre-inflate the incoming note's own box dimensions (centre filled per slot).
  const incomingInfl = rotatedAABB(noteW, noteH, rotation)

  // Callers pass existing notes already rotation-inflated and recentred
  // (MEDIUM fix 5), so e.pos_x/e.pos_y/e.w/e.h are already the inflated AABB.
  const existingBoxes: Box[] = existing.map((e) => ({ pos_x: e.pos_x, pos_y: e.pos_y, w: e.w, h: e.h }))

  let wall = { width: input.wall.width, height: input.wall.height }

  // Try to place; extend the wall by GROWTH_STEP (monotonic) along the growth
  // axis until a valid slot is found.
  // Growth axis: horizontal grows width; vertical grows height.
  for (let attempt = 0; attempt < 10000; attempt++) {
    const slots = buildSlots(wall, cellW, cellH, rand)

    // Rank slots by local density (ascending) — emptiest first.
    const ranked = slots
      .map((s) => ({
        s,
        density: localDensity(s, noteW, noteH, cellW, cellH, existingBoxes),
      }))
      .sort((a, b) => a.density - b.density)

    for (const { s } of ranked) {
      // ±30px seeded jitter on the slot position.
      const jx = (rand() * 60 - 30)
      const jy = (rand() * 60 - 30)
      const topLeftX = s.x + jx
      const topLeftY = s.y + jy

      // Incoming note's rotation-inflated, recentred box.
      const cx = topLeftX + noteW / 2
      const cy = topLeftY + noteH / 2
      const incoming: Box = {
        pos_x: cx - incomingInfl.w / 2,
        pos_y: cy - incomingInfl.h / 2,
        w: incomingInfl.w,
        h: incomingInfl.h,
      }

      if (!isValid(incoming, existingBoxes)) continue
      return { placement: { pos_x: topLeftX, pos_y: topLeftY, rotation }, wall }
    }

    // No slot passed — extend the wall (monotonic) and retry.
    if (orientation === 'horizontal') {
      wall = { width: wall.width + GROWTH_STEP, height: wall.height }
    } else {
      wall = { width: wall.width, height: wall.height + GROWTH_STEP }
    }
  }

  // Fallback (should never happen): place at origin.
  return { placement: { pos_x: 0, pos_y: 0, rotation }, wall }
}

interface Slot { x: number; y: number }

function buildSlots(
  wall: { width: number; height: number },
  cellW: number,
  cellH: number,
  rand: () => number
): Slot[] {
  const cols = Math.max(1, Math.floor(wall.width / cellW))
  const rows = Math.max(1, Math.floor(wall.height / cellH))
  const slots: Slot[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // cell center nudged by seeded jitter up to ±(cell/4).
      const jx = (rand() * (cellW / 2)) - cellW / 4
      const jy = (rand() * (cellH / 2)) - cellH / 4
      slots.push({ x: c * cellW + jx, y: r * cellH + jy })
    }
  }
  return slots
}

// Local density = sum of overlap area a note placed at the slot would have with
// existing notes within a 1-slot neighborhood.
function localDensity(
  s: Slot,
  noteW: number,
  noteH: number,
  cellW: number,
  cellH: number,
  existingBoxes: Box[]
): number {
  const candidate: Box = { pos_x: s.x, pos_y: s.y, w: noteW, h: noteH }
  let density = 0
  for (const b of existingBoxes) {
    // Neighborhood filter: only test boxes within noteW+cellW / noteH+cellH.
    if (Math.abs(b.pos_x - s.x) > noteW + cellW) continue
    if (Math.abs(b.pos_y - s.y) > noteH + cellH) continue
    density += overlapArea(candidate, b)
  }
  return density
}

// A candidate is rejected if EITHER:
//  (a) overlapArea(incoming, A) / (A.w * A.h) > 0.35 for any existing A, OR
//  (b) coveredFraction(A, higher-z boxes incl. incoming) > 0.40 for any A.
// At insertion time the incoming note is the only note above any existing A
// (newest-on-top under the comparator), so (b)'s union for A reduces to the
// incoming note's coverage of A. Boundary rule: reject iff STRICTLY MORE THAN
// 40 of 100 cells covered (exactly 40 passes).
function isValid(incoming: Box, existingBoxes: Box[]): boolean {
  for (const A of existingBoxes) {
    // (a) per-note 35% cap
    const area = A.w * A.h
    if (area > 0 && overlapArea(incoming, A) / area > 0.35) return false
    // (b) cumulative-visibility: incoming is the only higher-z box at insertion.
    if (coveredFraction(A, [incoming]) > 0.4) return false
  }
  return true
}
