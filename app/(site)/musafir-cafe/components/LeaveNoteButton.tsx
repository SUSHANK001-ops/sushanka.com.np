'use client'
import React, { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { SignInPopup } from '../../guestbook/ui'

interface LeaveNoteButtonProps {
  showGoogle: boolean
  onCompose: () => void
}

/**
 * The floating, sticky-note-shaped "Leave a promise" button (bottom-right,
 * z-index:10000). Signed-out clicks open SignInPopup
 * (action="leave your note", callbackUrl='/musafir-cafe'); signed-in clicks
 * open the composer.
 */
export default function LeaveNoteButton({ showGoogle, onCompose }: LeaveNoteButtonProps) {
  const { data: session } = useSession()
  const [signInOpen, setSignInOpen] = useState(false)

  const onClick = () => {
    if (session?.user) {
      onCompose()
    } else {
      setSignInOpen(true)
    }
  }

  return (
    <>
      <button
        type="button"
        className="mz-leave-btn"
        onClick={onClick}
        aria-label="Leave a note on the wall"
      >
        <span className="mz-leave-btn__pin" aria-hidden="true" />
        <span className="mz-leave-btn__label">Leave a promise</span>
      </button>

      <SignInPopup
        open={signInOpen}
        action="leave your note"
        providers={{ google: showGoogle }}
        onClose={() => setSignInOpen(false)}
        onSignIn={(p) => {
          setSignInOpen(false)
          signIn(p, { callbackUrl: '/musafir-cafe' })
        }}
      />
    </>
  )
}
