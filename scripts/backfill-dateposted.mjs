/**
 * One-time backfill: set `dateposted` = `createdAt` for any blog that is
 * missing it, so date display + ordering are consistent everywhere.
 * Run: node scripts/backfill-dateposted.mjs
 */
import mongoose from 'mongoose'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const raw = readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {}
}
loadEnv()

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI missing')
  process.exit(1)
}

const conn = await mongoose.connect(uri)
const coll = conn.connection.db.collection('blogs')

// Every doc missing dateposted (or where it's null) gets dateposted = createdAt.
const docs = await coll
  .find({ $or: [{ dateposted: { $exists: false } }, { dateposted: null }] })
  .toArray()

let updated = 0
for (const d of docs) {
  const value = d.createdAt || new Date()
  await coll.updateOne({ _id: d._id }, { $set: { dateposted: value } })
  updated++
  console.log(`✓ ${d.title} -> dateposted = ${value.toISOString?.() ?? value}`)
}

console.log(`\nBackfilled ${updated} blog(s).`)
await mongoose.disconnect()
