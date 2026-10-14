import { Schema, Model } from 'mongoose'
import { getPromiseWallConnection } from '@/lib/promiseWallDb'

export interface IPromiseNote {
  user_id: string            // PRIVATE — never serialized to clients
  display_name: string
  is_anonymous: boolean
  text: string
  font: string
  color: string
  ink_color: string
  drawing_url?: string | null
  photo_url?: string | null
  drawing_public_id?: string | null   // PRIVATE — Cloudinary cleanup on DELETE; never serialized
  photo_public_id?: string | null     // PRIVATE — Cloudinary cleanup on DELETE; never serialized
  photo_caption?: string | null
  pos_x: number              // horizontal layout
  pos_y: number
  pos_x_v: number            // vertical (mobile) layout
  pos_y_v: number
  rotation: number
  z_index: number
  pin_style: string
  status: 'visible' | 'hidden' | 'reported'
  report_count: number
  // created_at / updated_at provided by { timestamps: ... } mapped below
}

const PromiseNoteSchema = new Schema<IPromiseNote>(
  {
    user_id: { type: String, required: true, index: true },
    display_name: { type: String, required: true, trim: true, maxlength: 24 },
    is_anonymous: { type: Boolean, default: false },
    text: { type: String, default: '', maxlength: 280 },
    font: { type: String, required: true },
    color: { type: String, required: true },
    ink_color: { type: String, required: true },
    drawing_url: { type: String, default: null },
    photo_url: { type: String, default: null },
    drawing_public_id: { type: String, default: null }, // PRIVATE, never serialized
    photo_public_id: { type: String, default: null },   // PRIVATE, never serialized
    photo_caption: { type: String, default: null, maxlength: 280 },
    pos_x: { type: Number, required: true },
    pos_y: { type: Number, required: true },
    pos_x_v: { type: Number, required: true },
    pos_y_v: { type: Number, required: true },
    rotation: { type: Number, required: true, min: -6, max: 6 }, // ±6° enforced structurally
    z_index: { type: Number, required: true },
    pin_style: { type: String, default: 'none' },
    status: { type: String, enum: ['visible', 'hidden', 'reported'], default: 'visible', index: true },
    report_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
)

// Declared indexes ARE the migration — Mongo builds them on connect.
PromiseNoteSchema.index({ created_at: -1 })
PromiseNoteSchema.index({ status: 1 })
PromiseNoteSchema.index({ pos_x: 1, pos_y: 1 })

// IMPORTANT: this model must ONLY be created via getPromiseNoteModel() on the
// separate wall connection — never via mongoose.model(...) on the default connection.
export async function getPromiseNoteModel(): Promise<Model<IPromiseNote>> {
  const conn = await getPromiseWallConnection()
  return (
    (conn.models.PromiseNote as Model<IPromiseNote>) ||
    conn.model<IPromiseNote>('PromiseNote', PromiseNoteSchema)
  )
}
