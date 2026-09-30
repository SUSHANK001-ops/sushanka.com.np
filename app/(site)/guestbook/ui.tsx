'use client'
import React, { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X, LogIn, Github } from 'lucide-react'

/* ─────────────────────────── Toasts ─────────────────────────── */

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastCtx | null>(null)

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext)
  // Fallback no-op so the hook is safe even outside the provider.
  return ctx ?? { toast: () => {} }
}

const toastStyles: Record<ToastKind, { ring: string; icon: React.ReactNode }> = {
  success: {
    ring: 'border-c-green/40',
    icon: <CheckCircle2 size={17} className="text-c-green" />,
  },
  error: {
    ring: 'border-c-red/40',
    icon: <AlertCircle size={17} className="text-c-red" />,
  },
  info: {
    ring: 'border-border',
    icon: <Info size={17} className="text-foreground/70" />,
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, kind, message }])
      setTimeout(() => remove(id), 3800)
    },
    [remove]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-[calc(100vw-2.5rem)] max-w-sm flex-col gap-2.5">
        {toasts.map((t) => {
          const s = toastStyles[t.kind]
          return (
            <div
              key={t.id}
              role="status"
              className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border ${s.ring} bg-surface/95 p-3.5 pr-2.5 shadow-lg backdrop-blur`}
            >
              <span className="mt-0.5 shrink-0">{s.icon}</span>
              <p className="flex-1 text-sm leading-snug text-foreground">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                aria-label="Dismiss"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
      <style jsx>{`
        .toast-in {
          animation: toast-slide 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes toast-slide {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-in {
            animation: none;
          }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

/* ─────────────────────────── Confirm modal ─────────────────────────── */

interface ConfirmModalProps {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!open || !mounted) return null
  
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="modal-in relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h3 className="display-serif text-xl text-foreground">{title}</h3>
        {body && <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-transform hover:scale-[1.03] ${
              destructive
                ? 'bg-c-red text-white'
                : 'bg-foreground text-background'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style jsx>{`
        .modal-in {
          animation: modal-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes modal-pop {
          from {
            opacity: 0;
            transform: scale(0.94);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .modal-in {
            animation: none;
          }
        }
      `}</style>
    </div>,
    document.body
  )
}

/* ─────────────────────────── Sign-in popup ─────────────────────────── */

const GoogleGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M21.35 11.1H12v3.83h5.35c-.23 1.4-1.62 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 7.1 12 7.1c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 4.5 14.6 3.6 12 3.6 6.98 3.6 2.9 7.68 2.9 12.7s4.08 9.1 9.1 9.1c5.25 0 8.72-3.69 8.72-8.88 0-.6-.07-1.05-.15-1.5Z"
    />
  </svg>
)

interface SignInPopupProps {
  open: boolean
  action?: string // e.g. "like this message", "reply", "leave a message"
  providers?: { github?: boolean; google?: boolean }
  onClose: () => void
  onSignIn: (provider: 'github' | 'google') => void
}

export function SignInPopup({
  open,
  action = 'do that',
  providers,
  onClose,
  onSignIn,
}: SignInPopupProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!open || !mounted) return null
  const showGithub = providers?.github ?? true
  const showGoogle = providers?.google ?? true

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-in relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X size={15} />
        </button>
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/5 text-foreground">
          <LogIn size={22} />
        </div>
        <h3 className="display-serif text-xl text-foreground">Sign in to continue</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Please sign in to {action}. Your name and avatar come from your account — no spam.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {showGithub && (
            <button
              onClick={() => onSignIn('github')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40"
            >
              <Github size={16} /> Continue with GitHub
            </button>
          )}
          {showGoogle && (
            <button
              onClick={() => onSignIn('google')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40"
            >
              <GoogleGlyph /> Continue with Google
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        .modal-in {
          animation: modal-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes modal-pop {
          from {
            opacity: 0;
            transform: scale(0.94);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .modal-in {
            animation: none;
          }
        }
      `}</style>
    </div>,
    document.body
  )
}
