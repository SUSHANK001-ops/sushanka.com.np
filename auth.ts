import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

/**
 * Auth.js (NextAuth v5) — public visitor login (used by the guestbook) and,
 * for a small allowlist of emails, elevated ADMIN access.
 * Providers read credentials from env; if a provider's env vars are missing
 * it's simply not offered.
 */
const providers = []

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    })
  )
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  )
}

/**
 * Emails granted admin access. Kept here (and mirrored in lib/adminEmails)
 * so both the session callback and API routes agree.
 */
export const ADMIN_EMAILS = [
  'sushanklamichhane12@gmail.com',
  'mail.sushanka@gmail.com',
]

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase())
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Running behind a reverse proxy (sushanka.com.np). trustHost lets Auth.js
  // trust the forwarded host/proto so it builds the correct redirect_uri for
  // the token exchange — a mismatch here is a common cause of `invalid_grant`.
  trustHost: true,
  session: { strategy: 'jwt' },
  // Stateless JWT sessions — no DB adapter needed for simple identity.
  callbacks: {
    async jwt({ token }) {
      // Stamp admin status onto the token from the verified email.
      token.isAdmin = isAdminEmail(token.email)
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      if (session.user) {
        session.user.isAdmin = Boolean(token.isAdmin)
      }
      return session
    },
  },
})
