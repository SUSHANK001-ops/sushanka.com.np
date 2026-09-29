'use client'
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import {
  Loader2, Send, Github, LogOut, ImagePlus, X,
  Pencil, Trash2, Check, Plus, MessageCircle, Crown,
} from 'lucide-react'
import { ToastProvider, useToast, ConfirmModal, SignInPopup } from './ui'

interface Reply {
  _id: string
  userId?: string
  name: string
  avatar?: string
  message: string
  isAdmin?: boolean
  createdAt?: string
}

interface ReactionProfile {
  userId: string
  emoji: string
  name?: string
  avatar?: string
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
  likeProfiles?: { userId: string; name?: string; avatar?: string }[]
  reactions?: { emoji: string; count: number }[]
  reactionProfiles?: ReactionProfile[]
  reactionByMe?: string | null
  replies?: Reply[]
}

/* ─── Facebook-style emoji definitions ──────────────────────────────── */

interface EmojiDef {
  key: string
  label: string
  /** Facebook CDN animated URL — used in the picker hover state */
  animatedUrl: string
  /** Facebook CDN static URL — used in the reaction display */
  staticUrl: string
  /** Fallback native emoji if images fail to load */
  fallback: string
  /** Color used for the "active" highlight when you've reacted */
  color: string
}

const FB_EMOJIS: EmojiDef[] = [
  {
    key: '👍',
    label: 'Like',
    animatedUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Thumbs%20Up.png',
    staticUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Thumbs%20Up.png',
    fallback: '👍',
    color: '#2078f4',
  },
  {
    key: '❤️',
    label: 'Love',
    animatedUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Red%20Heart.png',
    staticUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Red%20Heart.png',
    fallback: '❤️',
    color: '#f33e58',
  },
  {
    key: '😂',
    label: 'Haha',
    animatedUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Face%20with%20Tears%20of%20Joy.png',
    staticUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Face%20with%20Tears%20of%20Joy.png',
    fallback: '😂',
    color: '#f7b125',
  },
  {
    key: '😮',
    label: 'Wow',
    animatedUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Face%20with%20Open%20Mouth.png',
    staticUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Face%20with%20Open%20Mouth.png',
    fallback: '😮',
    color: '#f7b125',
  },
  {
    key: '😢',
    label: 'Sad',
    animatedUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Crying%20Face.png',
    staticUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Crying%20Face.png',
    fallback: '😢',
    color: '#f7b125',
  },
  {
    key: '😡',
    label: 'Angry',
    animatedUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Angry%20Face.png',
    staticUrl: 'https://raw.githubusercontent.com/nicedayzhu/jetpack-emoji/master/img/Angry%20Face.png',
    fallback: '😡',
    color: '#e9710f',
  },
]

const emojiByKey = Object.fromEntries(FB_EMOJIS.map((e) => [e.key, e]))

// Preset keys sent to the API (must stay in sync with the API's presetEmojis)
const PRESET_KEYS = FB_EMOJIS.map((e) => e.key)

/* ─── Emoji Image component with fallback ───────────────────────────── */

function EmojiImg({
  emoji,
  size = 20,
  className = '',
  animated = false,
}: {
  emoji: string
  size?: number
  className?: string
  animated?: boolean
}) {
  const def = emojiByKey[emoji]
  const [failed, setFailed] = useState(false)

  if (!def || failed) {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
        {def?.fallback ?? emoji}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={animated ? def.animatedUrl : def.staticUrl}
      alt={def.label}
      width={size}
      height={size}
      className={className}
      draggable={false}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/* ─── Facebook-style Reaction Picker ────────────────────────────────── */

function ReactionPicker({
  entryId,
  currentReaction,
  onReact,
  visible,
}: {
  entryId: string
  currentReaction: string | null | undefined
  onReact: (entryId: string, emoji: string) => void
  visible: boolean
}) {
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null)

  if (!visible) return null

  return (
    <div
      className="reaction-picker"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {FB_EMOJIS.map((def, i) => {
        const isActive = currentReaction === def.key
        const isHovered = hoveredEmoji === def.key
        return (
          <button
            key={def.key}
            type="button"
            className={`reaction-picker__emoji ${isActive ? 'reaction-picker__emoji--active' : ''}`}
            style={{ animationDelay: `${i * 35}ms` }}
            onClick={() => onReact(entryId, def.key)}
            onMouseEnter={() => setHoveredEmoji(def.key)}
            onMouseLeave={() => setHoveredEmoji(null)}
            aria-label={`${isActive ? 'Remove' : 'React with'} ${def.label}`}
            title={def.label}
          >
            <span className={`reaction-picker__emoji-inner ${isHovered ? 'reaction-picker__emoji-inner--hovered' : ''}`}>
              <EmojiImg emoji={def.key} size={isHovered ? 32 : 24} animated={isHovered} />
            </span>
            {isHovered && (
              <span className="reaction-picker__tooltip">{def.label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Reaction Display (profiles + emoji badges) ────────────────────── */

function ReactionDisplay({
  reactions,
  reactionProfiles,
  reactionByMe,
  entryId,
  onReact,
}: {
  reactions?: { emoji: string; count: number }[]
  reactionProfiles?: ReactionProfile[]
  reactionByMe?: string | null
  entryId: string
  onReact: (entryId: string, emoji: string) => void
}) {
  if (!reactions || reactions.length === 0) return null

  // Show a summary row of all unique emojis + total count
  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className="reaction-display">
      {/* Profile avatars with emoji badges */}
      {reactionProfiles && reactionProfiles.length > 0 && (
        <div className="reaction-display__profiles" aria-label="People who reacted">
          {reactionProfiles.slice(0, 5).map((profile) => (
            <div key={`${profile.userId}-${profile.emoji}`} className="reaction-display__avatar-wrap" title={`${profile.name ?? 'Someone'} reacted ${emojiByKey[profile.emoji]?.label ?? profile.emoji}`}>
              {profile.avatar ? (
                <Image
                  src={profile.avatar}
                  alt={profile.name ?? 'User'}
                  width={26}
                  height={26}
                  className="reaction-display__avatar"
                />
              ) : (
                <span className="reaction-display__avatar-fallback">
                  {(profile.name ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="reaction-display__avatar-emoji">
                <EmojiImg emoji={profile.emoji} size={12} />
              </span>
            </div>
          ))}
          {totalCount > 5 && (
            <span className="reaction-display__overflow">+{totalCount - 5}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Small crown badge marking an allowlisted admin (site owner).
 *  Gradient gold pill with a gently looping shimmer + a bobbing crown. */
const AdminBadge = () => (
  <span
    title="Site admin"
    className="admin-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
  >
    <Crown size={11} className="admin-badge__crown" /> ADMIN
    <style jsx>{`
      .admin-badge {
        border: 1px solid color-mix(in srgb, #78aef7 55%, transparent);
        color: #78aef7;
      }
      .admin-badge__crown {
        color: #f5c542;
      }
      @media (prefers-reduced-motion: reduce) {
        .admin-badge { animation: none; }
      }
    `}</style>
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

const GuestbookInner = ({ providers }: GuestbookProps) => {
  // Default to showing both if the prop isn't supplied (backwards compatible).
  const showGithub = providers?.github ?? true
  const showGoogle = providers?.google ?? true
  const { data: session, status } = useSession()
  const myId = session?.user?.id ?? session?.user?.email ?? undefined
  const { toast } = useToast()

  // Confirm modal + sign-in popup state
  const [confirmState, setConfirmState] = useState<{
    title: string
    body?: string
    confirmLabel?: string
    onConfirm: () => void
  } | null>(null)
  const [signInAction, setSignInAction] = useState<string | null>(null)

  const requireSignIn = (action: string): boolean => {
    if (session?.user) return true
    setSignInAction(action)
    return false
  }

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [submitting, setSubmitting] = useState(false)
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

  // Reply + like state
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [postingReply, setPostingReply] = useState(false)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [likeBusy, setLikeBusy] = useState<string | null>(null)

  // Reaction picker state
  const [pickerEntryId, setPickerEntryId] = useState<string | null>(null)
  // Long-press handling for mobile
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  // Hover timer for desktop reaction picker
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track touch/mouse device
  const isTouchDevice = useRef(false)

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }, [])

  const load = () => {
    fetch('/api/guestbook')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => toast('Could not load messages.', 'error'))
      .finally(() => setLoading(false))
  }

  // Load once on mount. `load` is stable enough for this; disable the lint rule
  // rather than re-running on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  // Close picker on outside click
  useEffect(() => {
    if (!pickerEntryId) return
    const handle = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.reaction-picker') && !target.closest('.reaction-trigger')) {
        setPickerEntryId(null)
      }
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [pickerEntryId])

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
    setUploading(true)
    try {
      const uploaded = await uploadFile(file)
      if (uploaded) {
        setImageUrl(uploaded.url)
        setImagePublicId(uploaded.publicId ?? '')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed.', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireSignIn('leave a message')) return
    if (!message.trim()) {
      toast('Write a message first.', 'error')
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
      toast('Thanks for signing the guestbook!', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post message.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  const beginEdit = (entry: Entry) => {
    setEditingId(entry._id)
    setEditMessage(entry.message)
    setEditImage(entry.image ?? '')
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
      toast(err instanceof Error ? err.message : 'Upload failed.', 'error')
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
      toast('Message updated.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update.', 'error')
    } finally {
      setSavingEdit(false)
    }
  }
  const remove = (id: string) => {
    setConfirmState({
      title: 'Delete this message?',
      body: 'This will permanently remove your message from the guestbook.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          const res = await fetch(`/api/guestbook/${id}`, { method: 'DELETE' })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to delete.')
          setEntries((prev) => prev.filter((e) => e._id !== id))
          toast('Message deleted.', 'success')
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Failed to delete.', 'error')
        }
      },
    })
  }

  // ── Reactions ─────────────────────────────────────────────────────────
  const handleReact = useCallback(async (id: string, emoji: string) => {
    if (!requireSignIn('react to this message')) return
    if (likeBusy) return
    setLikeBusy(id)
    setPickerEntryId(null)

    // Find current entry state for optimistic update
    const entry = entries.find((e) => e._id === id)
    if (!entry) { setLikeBusy(null); return }

    const wasMyReaction = entry.reactionByMe
    const isSameEmoji = wasMyReaction === emoji
    const newReactionByMe = isSameEmoji ? null : emoji

    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => {
        if (e._id !== id) return e
        const oldReactions = [...(e.reactions ?? [])]
        const oldProfiles = [...(e.reactionProfiles ?? [])]

        let newReactions = oldReactions
        let newProfiles = oldProfiles

        if (isSameEmoji) {
          // Removing reaction
          newReactions = oldReactions.map((r) =>
            r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1) } : r
          ).filter((r) => r.count > 0)
          newProfiles = oldProfiles.filter((p) => !(p.userId === myId))
        } else {
          // Changing or adding
          if (wasMyReaction) {
            // Remove old
            newReactions = oldReactions.map((r) =>
              r.emoji === wasMyReaction ? { ...r, count: Math.max(0, r.count - 1) } : r
            ).filter((r) => r.count > 0)
            newProfiles = oldProfiles.filter((p) => !(p.userId === myId))
          }
          // Add new
          const existing = newReactions.find((r) => r.emoji === emoji)
          if (existing) {
            newReactions = newReactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1 } : r
            )
          } else {
            newReactions = [...newReactions, { emoji, count: 1 }]
          }
          newProfiles = [...newProfiles, {
            userId: myId ?? '',
            emoji,
            name: session?.user?.name ?? 'You',
            avatar: session?.user?.image ?? undefined,
          }]
        }

        return {
          ...e,
          reactionByMe: newReactionByMe,
          reactions: newReactions,
          reactionProfiles: newProfiles,
          likedByMe: !!newReactionByMe,
          likeCount: newProfiles.length,
        }
      })
    )

    try {
      const res = await fetch(`/api/guestbook/${id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to react.')
      // Reconcile with server truth
      setEntries((prev) =>
        prev.map((e) =>
          e._id === id
            ? {
                ...e,
                likedByMe: data.likedByMe,
                likeCount: data.likeCount,
                reactionByMe: data.reactionByMe,
                reactions: data.reactions,
                reactionProfiles: data.reactionProfiles,
                likeProfiles: data.likeProfiles,
              }
            : e
        )
      )
    } catch (err) {
      // Revert on failure
      load()
      toast(err instanceof Error ? err.message : 'Failed to react.', 'error')
    } finally {
      setLikeBusy(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, likeBusy, myId, session])

  // ── Long Press (mobile) ────────────────────────────────────────────────
  const handleTouchStart = useCallback((entryId: string) => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setPickerEntryId(entryId)
    }, 500)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // ── Hover (desktop) ────────────────────────────────────────────────────
  const handleMouseEnterEntry = useCallback((entryId: string) => {
    if (isTouchDevice.current) return
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    hoverTimer.current = setTimeout(() => {
      setPickerEntryId(entryId)
    }, 400)
  }, [])

  const handleMouseLeaveEntry = useCallback(() => {
    if (isTouchDevice.current) return
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    hideTimer.current = setTimeout(() => {
      setPickerEntryId(null)
    }, 500)
  }, [])

  const handleMouseEnterPicker = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const handleMouseLeavePicker = useCallback(() => {
    hideTimer.current = setTimeout(() => {
      setPickerEntryId(null)
    }, 300)
  }, [])

  // ── Replies ────────────────────────────────────────────────────────────
  const beginReply = (id: string) => {
    if (!requireSignIn('reply')) return
    setReplyingId(id)
    setReplyText('')
  }
  const cancelReply = () => {
    setReplyingId(null)
    setReplyText('')
  }
  const submitReply = async (id: string) => {
    if (!replyText.trim()) return
    setPostingReply(true)
    try {
      const res = await fetch(`/api/guestbook/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reply.')
      setEntries((prev) =>
        prev.map((e) =>
          e._id === id ? { ...e, replies: [...(e.replies ?? []), data.reply] } : e
        )
      )
      // Auto-expand so the author sees their new reply immediately.
      setExpandedReplies((prev) => new Set(prev).add(id))
      cancelReply()
      toast('Reply posted.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reply.', 'error')
    } finally {
      setPostingReply(false)
    }
  }
  const deleteReply = (entryId: string, replyId: string) => {
    setConfirmState({
      title: 'Delete this reply?',
      body: 'This reply will be permanently removed.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          const res = await fetch(`/api/guestbook/${entryId}/reply`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ replyId }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to delete reply.')
          setEntries((prev) =>
            prev.map((e) =>
              e._id === entryId
                ? { ...e, replies: (e.replies ?? []).filter((r) => r._id !== replyId) }
                : e
            )
          )
          toast('Reply deleted.', 'success')
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Failed to delete reply.', 'error')
        }
      },
    })
  }
  const toggleExpand = (id: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="pb-16">
      {showLimit && <LimitPopup onClose={() => setShowLimit(false)} />}

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        body={confirmState?.body}
        confirmLabel={confirmState?.confirmLabel}
        destructive
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />

      <SignInPopup
        open={!!signInAction}
        action={signInAction ?? undefined}
        providers={{ github: showGithub, google: showGoogle }}
        onClose={() => setSignInAction(null)}
        onSignIn={(p) => {
          setSignInAction(null)
          signIn(p)
        }}
      />

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
            const pickerVisible = pickerEntryId === entry._id
            return (
              <li
                key={entry._id}
                className="guestbook-entry relative py-2 sm:py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                    {entry.avatar && (
                      <Image
                        src={entry.avatar}
                        alt={entry.name}
                        width={34}
                        height={34}
                        className="rounded-md object-cover"
                      />
                    )}
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <span className="text-sm text-muted">signed the guestbook</span>
                    {entry.isAdmin && <AdminBadge />}
                    {mine && (
                      <span className="rounded-full bg-c-green/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-link">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
                    <span className="font-mono text-xs text-muted/80">
                      {timeAgo(entry.createdAt)}
                    </span>
                    {/* Owner-only edit / delete controls */}
                    {mine && !isEditing && (
                      <div className="flex items-center gap-0.5 sm:gap-1.5">
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
                    <p className="mt-2 pl-0 text-sm leading-relaxed text-foreground/80 sm:pl-[46px]">{entry.message}</p>
                    {entry.image && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-border sm:ml-[46px]">
                        <Image
                          src={entry.image}
                          alt="Guestbook attachment"
                          width={640}
                          height={400}
                          className="h-auto w-full max-w-sm object-cover transition-transform duration-300 hover:scale-[1.03]"
                        />
                      </div>
                    )}

                    {/* Actions: reactions + reply */}
                    <div className="relative mt-3 ml-0 flex flex-wrap items-center gap-3 sm:ml-[46px]">
                      {/* Reaction picker trigger / Facebook-style hover area */}
                      <div
                        className="reaction-trigger relative"
                        onMouseEnter={() => handleMouseEnterEntry(entry._id)}
                        onMouseLeave={handleMouseLeaveEntry}
                        onTouchStart={() => handleTouchStart(entry._id)}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchMove}
                      >
                        {/* Quick react button — click to toggle default (Like), or shows picker on hover/long-press */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (entry.reactionByMe) {
                              // If already reacted, clicking removes it
                              handleReact(entry._id, entry.reactionByMe)
                            } else {
                              // Default quick react
                              handleReact(entry._id, '👍')
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 text-xs transition-colors ${
                            entry.reactionByMe
                              ? 'font-semibold'
                              : 'text-muted hover:text-foreground'
                          }`}
                          style={entry.reactionByMe ? { color: emojiByKey[entry.reactionByMe]?.color ?? '#2078f4' } : undefined}
                          aria-label={entry.reactionByMe ? `You reacted ${emojiByKey[entry.reactionByMe]?.label ?? entry.reactionByMe}. Click to remove.` : 'Like'}
                        >
                          {entry.reactionByMe ? (
                            <>
                              <EmojiImg emoji={entry.reactionByMe} size={16} />
                              {emojiByKey[entry.reactionByMe]?.label ?? 'Like'}
                            </>
                          ) : (
                            <>
                              <EmojiImg emoji="👍" size={16} />
                              Like
                            </>
                          )}
                        </button>

                        {/* Floating picker — positioned above the button */}
                        <div
                          className="reaction-picker-wrapper"
                          onMouseEnter={handleMouseEnterPicker}
                          onMouseLeave={handleMouseLeavePicker}
                        >
                          <ReactionPicker
                            entryId={entry._id}
                            currentReaction={entry.reactionByMe}
                            onReact={handleReact}
                            visible={pickerVisible}
                          />
                        </div>
                      </div>

                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          replyingId === entry._id ? cancelReply() : beginReply(entry._id)
                        }}
                        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
                      >
                        <MessageCircle size={15} />
                        Reply
                      </button>

                      {/* Reaction display — emoji pills + avatar stack */}
                      <ReactionDisplay
                        reactions={entry.reactions}
                        reactionProfiles={entry.reactionProfiles}
                        reactionByMe={entry.reactionByMe}
                        entryId={entry._id}
                        onReact={handleReact}
                      />
                    </div>

                    {/* Reply composer */}
                    {replyingId === entry._id && (
                      <div className="mt-3 ml-8 border-l-2 border-border pl-4 sm:ml-12">
                        {session?.user ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                            <textarea
                              rows={2}
                              autoFocus
                              placeholder="Write a reply…"
                              className={`${inputClass} resize-none`}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              maxLength={500}
                            />
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                onClick={() => submitReply(entry._id)}
                                disabled={postingReply || !replyText.trim()}
                                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-60"
                              >
                                {postingReply ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                                Reply
                              </button>
                              <button
                                onClick={cancelReply}
                                className="text-xs text-muted transition-colors hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted">Sign in to reply.</p>
                        )}
                      </div>
                    )}

                    {/* Replies list — show 1, then "see more" */}
                    {entry.replies && entry.replies.length > 0 && (
                      <div className="mt-4 ml-8 space-y-3 border-l-2 border-border pl-4 sm:ml-12">
                        {(expandedReplies.has(entry._id)
                          ? entry.replies
                          : entry.replies.slice(0, 1)
                        ).map((reply) => {
                          const myReply = !!myId && reply.userId === myId
                          return (
                            <div
                              key={reply._id}
                              className="group/reply"
                            >
                              <div className="flex items-center gap-2">
                                {reply.avatar && (
                                  <Image
                                    src={reply.avatar}
                                    alt={reply.name}
                                    width={18}
                                    height={18}
                                    className="rounded-full"
                                  />
                                )}
                                <span className="text-xs font-semibold text-foreground">
                                  {reply.name}
                                </span>
                                {reply.isAdmin && <AdminBadge />}
                                {reply.createdAt && (
                                  <span className="font-mono text-[0.65rem] text-muted">
                                    {timeAgo(reply.createdAt)}
                                  </span>
                                )}
                                {myReply && (
                                  <button
                                    onClick={() => deleteReply(entry._id, reply._id)}
                                    aria-label="Delete reply"
                                    className="ml-auto grid h-6 w-6 place-items-center rounded-full text-muted opacity-0 transition-all hover:bg-c-red/15 hover:text-c-red group-hover/reply:opacity-100"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <p
                                className={`mt-1 text-sm leading-relaxed ${
                                  reply.isAdmin ? 'text-foreground/90' : 'text-foreground/75'
                                }`}
                              >
                                {reply.message}
                              </p>
                            </div>
                          )
                        })}

                        {entry.replies.length > 1 && (
                          <button
                            onClick={() => toggleExpand(entry._id)}
                            className="text-xs font-medium text-link transition-opacity hover:opacity-80"
                          >
                            {expandedReplies.has(entry._id)
                              ? 'Show less'
                              : `See ${entry.replies.length - 1} more ${
                                  entry.replies.length - 1 === 1 ? 'reply' : 'replies'
                                }`}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Reaction picker & display styles */}
      <style jsx global>{`
        /* ─── Reaction Picker (Facebook-style floating bar) ─────────── */
        .reaction-trigger {
          position: relative;
        }

        .reaction-picker-wrapper {
          position: absolute;
          bottom: calc(100% + 6px);
          left: -4px;
          z-index: 50;
          pointer-events: none;
        }

        .reaction-picker-wrapper:has(.reaction-picker) {
          pointer-events: auto;
        }

        .reaction-picker {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          padding: 6px 10px;
          border-radius: 30px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 0 0 1px rgba(0, 0, 0, 0.04);
          pointer-events: auto;
          animation: picker-pop 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-origin: bottom left;
          white-space: nowrap;
        }

        @keyframes picker-pop {
          0% {
            opacity: 0;
            transform: scale(0.6) translateY(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .reaction-picker__emoji {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 50%;
          transition: background-color 0.15s;
          animation: emoji-bounce-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
        }

        .reaction-picker__emoji--active {
          background: color-mix(in srgb, var(--foreground) 8%, transparent);
        }

        @keyframes emoji-bounce-in {
          0% {
            opacity: 0;
            transform: scale(0) translateY(16px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .reaction-picker__emoji-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .reaction-picker__emoji-inner--hovered {
          transform: scale(1.3) translateY(-6px);
        }

        .reaction-picker__tooltip {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: var(--foreground);
          color: var(--background);
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 10px;
          white-space: nowrap;
          pointer-events: none;
          animation: tooltip-pop 0.15s cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes tooltip-pop {
          from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.9); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }

        /* ─── Reaction Display ─────────────────────────────────────── */
        .reaction-display {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .reaction-display__summary {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }

        .reaction-display__pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px 3px 6px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: transparent;
          cursor: pointer;
          font-size: 12px;
          color: var(--muted);
          transition: all 0.15s ease;
          position: relative;
        }

        .reaction-display__pill:hover {
          border-color: color-mix(in srgb, var(--foreground) 30%, transparent);
          background: color-mix(in srgb, var(--foreground) 5%, transparent);
        }

        .reaction-display__pill--mine {
          border-color: #2078f4;
          background: color-mix(in srgb, #2078f4 8%, transparent);
          color: #2078f4;
        }

        .reaction-display__pill--mine:hover {
          background: color-mix(in srgb, #2078f4 14%, transparent);
        }

        .reaction-display__count {
          font-weight: 600;
          font-size: 12px;
          line-height: 1;
        }

        .reaction-display__tooltip {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: var(--foreground);
          color: var(--background);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 8px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 60;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          animation: tooltip-pop 0.15s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .reaction-display__profiles {
          display: flex;
          align-items: center;
        }

        .reaction-display__avatar-wrap {
          position: relative;
          margin-left: -6px;
          transition: transform 0.15s;
        }

        .reaction-display__avatar-wrap:first-child {
          margin-left: 0;
        }

        .reaction-display__avatar-wrap:hover {
          transform: scale(1.15);
          z-index: 2;
        }

        .reaction-display__avatar {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--surface);
        }

        .reaction-display__avatar-fallback {
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 2px solid var(--surface);
          background: var(--surface-2);
          font-size: 10px;
          font-weight: 700;
          color: var(--muted);
        }

        .reaction-display__avatar-emoji {
          position: absolute;
          bottom: -3px;
          right: -3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }

        .reaction-display__overflow {
          margin-left: 4px;
          font-size: 11px;
          color: var(--muted);
          font-weight: 600;
        }

        /* ─── Mobile adjustments ──────────────────────────────────── */
        @media (max-width: 640px) {
          .reaction-picker-wrapper {
            left: 0;
          }

          .reaction-picker {
            gap: 0;
            padding: 4px 6px;
          }

          .reaction-picker__emoji {
            padding: 3px;
          }
        }

        /* ─── Reduced motion ──────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .reaction-picker,
          .reaction-picker__emoji,
          .reaction-picker__emoji-inner,
          .reaction-picker__tooltip {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  )
}

/** Public wrapper — provides the toast context around the guestbook. */
const Guestbook = (props: GuestbookProps) => (
  <ToastProvider>
    <GuestbookInner {...props} />
  </ToastProvider>
)

export default Guestbook
