// THROWAWAY sanity-check for FEAT-004. Deleted after run.
// Run with Node v24 native TS import.
import {
  rotatedAABB,
  noteBox,
  coveredFraction,
  placeNote,
  NOTE_W,
  NOTE_H,
  PHOTO_NOTE_H,
} from './lib/notePlacement.ts'
import { isClean } from './lib/profanity.ts'

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) {
    pass++
    console.log('PASS:', name)
  } else {
    fail++
    console.log('FAIL:', name)
  }
}

// --- rotatedAABB 0 identity, ~10% growth at 6 ---
const r0 = rotatedAABB(160, 160, 0)
check('rotatedAABB(160,160,0) identity', r0.w === 160 && r0.h === 160)
const r6 = rotatedAABB(160, 160, 6)
const growth = (r6.w - 160) / 160
check(`rotatedAABB(160,160,6) ~10% growth (got ${(growth * 100).toFixed(2)}%)`,
  growth > 0.08 && growth < 0.12)

// --- noteBox height flag ---
check('noteBox(false).h === NOTE_H', noteBox(false).h === NOTE_H)
check('noteBox(true).h === PHOTO_NOTE_H', noteBox(true).h === PHOTO_NOTE_H)

// --- coveredFraction: exactly 40 cells passes (<=0.40), 41+ rejected (>0.40) ---
// A box of 100x100 at origin; a higher-z box covering 4 of 10 columns fully = 40 cells.
const A = { pos_x: 0, pos_y: 0, w: 100, h: 100 }
// cover columns 0..3 (cell centers at 5,15,25,35 => i=0..3) across all rows => 40 cells.
const cover40 = { pos_x: 0, pos_y: 0, w: 40, h: 100 }
const f40 = coveredFraction(A, [cover40])
check(`coveredFraction exactly 40 cells === 0.40 (got ${f40})`, f40 === 0.4)
check('exactly 40 cells PASSES (not > 0.40)', !(f40 > 0.4))

// 45-wide covers columns 0..4 (centers 5,15,25,35,45) => 50 cells => rejected.
const cover50 = { pos_x: 0, pos_y: 0, w: 45, h: 100 }
const f50 = coveredFraction(A, [cover50])
check(`coveredFraction 45-wide > 0.40 (got ${f50})`, f50 > 0.4)

// --- three disjoint 20% overlaps cumulatively 60% => REJECTED by cumulative rule ---
// Three higher-z boxes, each covering 2 distinct columns (20 cells), disjoint.
const b1 = { pos_x: 0, pos_y: 0, w: 20, h: 100 }   // cols 0..1 (centers 5,15) = 20
const b2 = { pos_x: 20, pos_y: 0, w: 20, h: 100 }  // cols 2..3 (centers 25,35) = 20
const b3 = { pos_x: 40, pos_y: 0, w: 20, h: 100 }  // cols 4..5 (centers 45,55) = 20
const fUnion = coveredFraction(A, [b1, b2, b3])
check(`three disjoint 20% overlaps cumulatively 60% (got ${fUnion})`, fUnion === 0.6)
check('three-disjoint-20% (60%) is REJECTED (> 0.40)', fUnion > 0.4)

// --- placeNote determinism for fixed seed ---
const existing = [
  { pos_x: 200, pos_y: 200, w: 176, h: 176 },
  { pos_x: 600, pos_y: 400, w: 176, h: 231 },
]
const input = {
  existing,
  noteW: NOTE_W,
  noteH: NOTE_H,
  wall: { width: 2400, height: 900 },
  orientation: 'horizontal',
  seed: 123456789,
}
const p1 = placeNote(input)
const p2 = placeNote(input)
check('placeNote deterministic for fixed seed',
  p1.placement.pos_x === p2.placement.pos_x &&
  p1.placement.pos_y === p2.placement.pos_y &&
  p1.placement.rotation === p2.placement.rotation &&
  p1.wall.width === p2.wall.width &&
  p1.wall.height === p2.wall.height)

// --- profanity cases ---
check('isClean(null)', isClean(null) === true)
check('isClean("")', isClean('') === true)
check('isClean("   ")', isClean('   ') === true)
check('isClean("hello world") clean', isClean('hello world') === true)
check('isClean("fuck") dirty whole word', isClean('fuck') === false)
check('isClean("You are a bitch") dirty whole word', isClean('You are a bitch') === false)
// Scunthorpe-type: blocked substring inside an innocent word must NOT match.
check('isClean("scunthorpe") Scunthorpe pass', isClean('scunthorpe') === true)
check('isClean("class assassin") substring pass', isClean('class assassin') === true)
check('isClean("Penistone") substring pass', isClean('Penistone') === true)
// leetspeak / diacritic variants
check('isClean("sh1t") leet dirty', isClean('sh1t') === false)
check('isClean("$hit") leet dirty', isClean('$hit') === false)
check('isClean("@sshole") leet dirty', isClean('@sshole') === false)
check('isClean("fücker"-style diacritic) dirty', isClean('f\u00fcck') === false)

console.log(`\nTOTAL: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
