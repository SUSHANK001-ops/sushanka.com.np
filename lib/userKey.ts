/**
 * Stable per-user identity key for guestbook likes / entries / replies.
 *
 * Uses the verified email (lowercased) as the primary key because it is
 * consistent for the same account across logout/login. Falls back to the
 * session user id only if no email is present. Keeping this in one place makes
 * sure every guestbook route derives the SAME key, so a user can't like or act
 * as a different identity after re-authenticating.
 */
export function userKey(
  session: { user?: { id?: string; email?: string | null } } | null
): string | undefined {
  const email = session?.user?.email
  if (email) return email.toLowerCase()
  const id = session?.user?.id
  return id ? id.toLowerCase() : undefined
}
