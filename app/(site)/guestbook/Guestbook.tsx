'use client'
import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import {
  Loader2, Send, Github, LogOut, ImagePlus, X,
  Pencil, Trash2, Check, Heart, MessageCircle, Crown,
} from 'lucide-react'

interface Reply {
  _id: string
  userId?: string
  name: string
  avatar?: string
  message: string
  isAdmin?: boolean
  createdAt?: string
}

interface Entry {
  _id: string
  name: string
  message: string
  avatar?: string
  provider?: string
  userId?: string
  isAdmin?: boolean
  image?: string
  createdAt: string
  updatedAt?: string
  likeCount?: number
  likedByMe?: boolean
  replies?: Reply[]
}

/** Small crown badge marking an allowlisted admin (site owner). */
const AdminBadge = () => (
  <span
    title="Site admin"
    className="inline-flex items-center gap-1 rounded-full bg-c-yellow/25 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[#8a6d1f] dark:text-c-yellow"
  >
    <Crown size={11} className="fill-current" /> Admin
  </span>
)

/** Relative "X days ago" formatting. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.round(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-muted outline-none transition-colors focus:border-foreground/40'

const GoogleGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M21.35 11.1H12v3.83h5.35c-.23 1.4-1.62 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 7.1 12 7.1c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 4.5 14.6 3.6 12 3.6 6.98 3.6 2.9 7.68 2.9 12.7s4.08 9.1 9.1 9.1c5.25 0 8.72-3.69 8.72-8.88 0-.6-.07-1.05-.15-1.5Z"
    />
  </svg>
)

/** Small popup shown when the user can't add more messages. */
function LimitPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-c-yellow/25 text-2xl">
          🌸
        </div>
        <h3 className="display-serif text-xl text-foreground">Thanks for signing!</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You&apos;ve left plenty of lovely notes here already. Delete one of your
          messages if you&apos;d like to add a new one.
        </p>
        <button
          onClick={onClose}
          data-click-sound
          className="pop-btn mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

interface GuestbookProps {
  providers?: { github?: boolean; google?: boolean }
}

const Guestbook = ({ providers }: GuestbookProps) => {
  // Default to showing both if the prop isn't supplied (backwards compatible).
  const showGithub = providers?.github ?? true
  const showGoogle = providers?.google ?? true
  const { data: session, status } = useSession()
  const myId = session?.user?.id ?? session?.user?.email ?? undefined

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showLimit, setShowLimit] = useState(false)

  // Compose image
  const [imageUrl, setImageUrl] = useState('')
  const [imagePublicId, setImagePublicId] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMessage, setEditMessage] = useState('')
  const [editImage, setEditImage] = useState<string>('')
  const [savingEdit, setSavingEdit] = useState(false)
  const editFileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    fetch('/api/guestbook')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setError('Could not load messages.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  /** Upload a file to the guestbook uploader, returns url + publicId. */
  const uploadFile = async (file: File): Promise<{ url: string; publicId?: string } | null> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/guestbook/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload failed.')
    return { url: data.url as string, publicId: data.publicId as string | undefined }
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const uploaded = await uploadFile(file)
      if (uploaded) {
        setImageUrl(uploaded.url)
        setImagePublicId(uploaded.publicId ?? '')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!message.trim()) {
      setError('Write a message first.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          website,
          image: imageUrl || undefined,
          imagePublicId: imagePublicId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.limitReached) {
          setShowLimit(true)
          return
        }
        throw new Error(data.error || 'Failed to post message.')
      }

      if (data.entry) setEntries((prev) => [data.entry, ...prev])
      else load()
      setMessage('')
      setImageUrl('')
      setImagePublicId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post message.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  const beginEdit = (entry: Entry) => {
    setEditingId(entry._id)
    setEditMessage(entry.message)
    setEditImage(entry.image ?? '')
    setError('')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditMessage('')
    setEditImage('')
  }
  const onEditPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadFile(file)
      if (uploaded) setEditImage(uploaded.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (editFileRef.current) editFileRef.current.value = ''
    }
  }
  const saveEdit = async (id: string) => {
    if (!editMessage.trim()) return

    // If nothing actually changed, don't hit the API — just close the editor.
    const original = entries.find((e) => e._id === id)
    const messageUnchanged = (original?.message ?? '') === editMessage.trim()
    const imageUnchanged = (original?.image ?? '') === (editImage ?? '')
    if (messageUnchanged && imageUnchanged) {
      cancelEdit()
      return
    }

    setSavingEdit(true)
    try {
      const res = await fetch(`/api/guestbook/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: editMessage, image: editImage }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update.')
      setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, ...data.entry } : e)))
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update.')
    } finally {
      setSavingEdit(false)
    }
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this message?')) return
    try {
      const res = await fetch(`/api/guestbook/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete.')
      setEntries((prev) => prev.filter((e) => e._id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
    }
  }

  return (
    <div className="pb-16">
      {showLimit && <LimitPopup onClose={() => setShowLimit(false)} />}

      {/* Compose / auth area */}
      {status === 'loading' ? (
        <div className="mb-12 flex items-center gap-2 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Checking session…
        </div>
      ) : session?.user ? (
        <form
          onSubmit={submit}
          className="mb-12 space-y-4 rounded-2xl border border-border bg-surface p-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? 'You'}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-sm text-foreground">
                Signed in as <strong>{session.user.name}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
              data-click-sound
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>

          <textarea
            rows={3}
            placeholder="Leave a message…"
            className={`${inputClass} resize-none`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
          />

          {/* Image preview */}
          {(imageUrl || uploading) && (
            <div className="relative w-fit">
              {imageUrl ? (
                // Plain img so the preview renders instantly regardless of loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Attachment preview"
                  className="h-24 w-auto rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-24 w-32 items-center justify-center rounded-lg border border-dashed border-border text-muted">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              )}
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl('')
                    setImagePublicId('')
                  }}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow"
                  aria-label="Remove image"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {/* Honeypot */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="hidden"
            aria-hidden="true"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting || uploading}
                data-click-sound
                className="pop-btn inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Sign guestbook
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                data-click-sound
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm text-muted transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-60"
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                Photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickImage}
                className="hidden"
              />
            </div>
            {error && <p className="text-xs text-c-red">{error}</p>}
          </div>
        </form>
      ) : (
        <div className="mb-12 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-foreground">Sign in to leave a message</p>
          <p className="mt-1 text-xs text-muted">
            Your name and avatar come from your account. No spam, promise.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {showGithub && (
              <button
                onClick={() => signIn('github')}
                data-click-sound
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40"
              >
                <Github size={15} /> Continue with GitHub
              </button>
            )}
            {showGoogle && (
              <button
                onClick={() => signIn('google')}
                data-click-sound
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40"
              >
                <GoogleGlyph /> Continue with Google
              </button>
            )}
            {!showGithub && !showGoogle && (
              <p className="text-xs text-c-red">
                Sign-in is temporarily unavailable — no login providers are configured.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {loading ? (
        <p className="text-sm text-muted">Loading messages…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No messages yet. Be the first to sign.</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => {
            const mine = !!myId && entry.userId === myId
            const isEditing = editingId === entry._id
            return (
              <li key={entry._id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {entry.avatar && (
                      <Image
                        src={entry.avatar}
                        alt={entry.name}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                    )}
                    <span className="font-semibold text-foreground">{entry.name}</span>
                    {mine && (
                      <span className="rounded-full bg-c-green/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-link">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-xs text-muted">
                      {timeAgo(entry.createdAt)}
                    </span>
                    {/* Owner-only edit / delete controls */}
                    {mine && !isEditing && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => beginEdit(entry)}
                          aria-label="Edit message"
                          className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => remove(entry._id)}
                          aria-label="Delete message"
                          className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-c-red/15 hover:text-c-red"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-3 space-y-3">
                    <textarea
                      rows={3}
                      className={`${inputClass} resize-none`}
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      maxLength={500}
                    />
                    {editImage && (
                      <div className="relative w-fit">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={editImage}
                          alt="Attachment"
                          className="h-24 w-auto rounded-lg border border-border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setEditImage('')}
                          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow"
                          aria-label="Remove image"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(entry._id)}
                        disabled={savingEdit || uploading}
                        className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-70"
                      >
                        {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Save
                      </button>
                      <button
                        onClick={() => editFileRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-60"
                      >
                        {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                        Photo
                      </button>
                      <input
                        ref={editFileRef}
                        type="file"
                        accept="image/*"
                        onChange={onEditPickImage}
                        className="hidden"
                      />
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-muted transition-colors hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/80">{entry.message}</p>
                    {entry.image && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-border">
                        <Image
                          src={entry.image}
                          alt="Guestbook attachment"
                          width={640}
                          height={400}
                          className="h-auto w-full max-w-sm object-cover"
                        />
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default Guestbook
