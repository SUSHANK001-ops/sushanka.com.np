// Shared type contract for the Musafir Cafe Promise Wall.
// Single source of truth imported by both the POST handler and the composer.

export type NoteFont = 'caveat' | 'kalam' | 'patrick-hand' | 'reenie-beanie'
export type NoteColor = 'yellow' | 'pink' | 'mint' | 'kraft' | 'white' | 'orange' | 'blue'
export type NoteInk = 'blue' | 'black' | 'brown'
export type PinStyle = 'none' | 'pin-red' | 'pin-blue' | 'pin-yellow' | 'tape-h' | 'tape-diag'

export interface PublicNote {
  id: string                 // Mongo _id as string
  display_name: string
  is_anonymous: boolean
  text: string
  font: NoteFont
  color: NoteColor
  ink_color: NoteInk
  drawing_url: string | null
  photo_url: string | null
  photo_caption: string | null
  pos_x: number              // horizontal (desktop) layout, authoritative
  pos_y: number
  pos_x_v: number            // vertical (mobile) layout, authoritative
  pos_y_v: number
  rotation: number           // degrees, -6..+6 (shared across both orientations)
  z_index: number
  pin_style: PinStyle
  created_at: string         // ISO
  mine: boolean              // derived server-side; NEVER expose user_id
}

// Ink/paper contrast allow-map. Server-authoritative; mirrored in the composer.
// Imported by the POST handler AND the composer.
// Every allowed pair clears WCAG AA (>= 4.5:1); the two excluded pairs
// (blue ink on blue paper, brown ink on kraft paper) are the only low-contrast
// combinations and are rejected.
export const INK_FOR_COLOR: Record<NoteColor, NoteInk[]> = {
  yellow: ['blue', 'black', 'brown'],
  pink:   ['blue', 'black', 'brown'],
  mint:   ['blue', 'black', 'brown'],
  white:  ['blue', 'black', 'brown'],
  orange: ['blue', 'black', 'brown'],
  blue:   ['black', 'brown'],         // blue ink on blue paper is too low-contrast
  kraft:  ['black', 'blue'],          // brown ink on kraft-brown paper fails contrast
}
