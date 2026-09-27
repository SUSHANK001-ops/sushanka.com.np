/**
 * One-time backfill: sanitize the stored HTML `content` of every existing blog
 * post, so posts created before write-time sanitization was added can't carry a
 * stored-XSS payload. Safe to re-run (idempotent — sanitizing clean HTML is a
 * no-op). Run: node scripts/sanitize-existing-blogs.mjs
 */
import mongoose from 'mongoose'
import sanitizeHtml from 'sanitize-html'
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

// Keep this allowlist in sync with lib/sanitizeBlog.ts
function sanitizeBlogHtml(dirty) {
  if (!dirty) return ''
  return sanitizeHtml(dirty, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'span', 'div',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark',
      'blockquote', 'pre', 'code',
      'ul', 'ol', 'li',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'figure', 'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['id', 'class', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: true,
    disallowedTagsMode: 'discard',
  })
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI missing')
  process.exit(1)
}

const conn = await mongoose.connect(uri)
const coll = conn.connection.db.collection('blogs')
const docs = await coll.find({}, { projection: { content: 1, title: 1 } }).toArray()

let changed = 0
for (const d of docs) {
  const clean = sanitizeBlogHtml(d.content || '')
  if (clean !== d.content) {
    await coll.updateOne({ _id: d._id }, { $set: { content: clean } })
    changed++
    console.log(`✓ sanitized: ${d.title}`)
  }
}

console.log(`\nChecked ${docs.length} post(s); sanitized ${changed}.`)
await mongoose.disconnect()
