import nodemailer from 'nodemailer'

/**
 * Shared transporter factory — mirrors the contact-form / OTP verification
 * setup (Gmail SMTP over SSL on 465). Throws if credentials are missing so the
 * caller can surface the real reason instead of silently doing nothing.
 */
function createTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER or SMTP_PASS not set in environment variables')
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

/** Minimal HTML escaping so user-supplied text can't break the markup. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendNotificationEmail({
  to,
  subject,
  link,
  recipientName,
  replyText,
  originalMessage,
  message,
}: {
  to: string
  subject: string
  link: string
  /** First name (or display name) of the person who left the guestbook entry. */
  recipientName?: string
  /** What the admin actually replied with. */
  replyText?: string
  /** The visitor's original guestbook message, for context. */
  originalMessage?: string
  /** Legacy single-line body; used as a fallback if replyText isn't given. */
  message?: string
}): Promise<{ sent: boolean; reason?: string }> {
  if (!to) {
    console.warn('sendNotificationEmail: no recipient address provided; skipping.')
    return { sent: false, reason: 'missing-recipient' }
  }

  let transporter: nodemailer.Transporter
  try {
    transporter = createTransporter()
  } catch (error) {
    console.error('sendNotificationEmail: cannot create transporter:', error)
    return { sent: false, reason: 'smtp-not-configured' }
  }

  const firstName = (recipientName ?? '').trim().split(/\s+/)[0] || 'there'
  const reply = (replyText ?? message ?? '').trim()

  // Fun + professional copy. Warm, a little witty, still polished.
  const html = `
  <div style="margin:0;padding:0;background:#0b1220;">
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#e5e7eb;">
      <p style="letter-spacing:0.22em;text-transform:uppercase;font-size:11px;color:#7dd3fc;margin:0 0 10px;">Guestbook · you've got a reply</p>
      <h1 style="margin:0 0 8px;font-size:24px;line-height:1.3;color:#ffffff;">Hey ${escapeHtml(firstName)}, Sushanka wrote back 👋</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#cbd5e1;">
        You signed the guestbook, dropped some kind words, and then — plot twist — a human actually replied.
        No bots were harmed in the making of this message.
      </p>

      ${
        originalMessage
          ? `<div style="margin:0 0 14px;padding:14px 16px;border-radius:12px;background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.15);">
               <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">You said</p>
               <p style="margin:0;font-size:14px;line-height:1.6;color:#e2e8f0;">${escapeHtml(originalMessage)}</p>
             </div>`
          : ''
      }

      <div style="margin:0 0 24px;padding:16px 18px;border-radius:12px;background:rgba(32,120,244,0.12);border:1px solid rgba(125,211,252,0.3);">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#7dd3fc;">Sushanka replied</p>
        <p style="margin:0;font-size:15px;line-height:1.65;color:#ffffff;">${escapeHtml(reply) || 'Come see what I said on the site.'}</p>
      </div>

      <div style="text-align:center;margin:0 0 26px;">
        <a href="${link}" style="display:inline-block;background:#2078f4;color:#ffffff;padding:12px 26px;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">
          Read it on the site →
        </a>
      </div>

      <p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#94a3b8;">
        Thanks for stopping by and leaving a mark. It genuinely made my day a little better.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#cbd5e1;">— Sushanka Lamichhane</p>

      <hr style="border:none;border-top:1px solid rgba(148,163,184,0.15);margin:24px 0 12px;" />
      <p style="margin:0;font-size:11px;color:#64748b;">
        You're getting this because you left a message on sushanka.com.np. No subscriptions, no spam — just this one friendly nudge.
      </p>
    </div>
  </div>
  `

  try {
    await transporter.sendMail({
      from: `"Sushanka Lamichhane" <${process.env.SMTP_USER}>`,
      to,
      subject: `[Portfolio] ${subject}`,
      html,
    })
    console.log(`Notification email sent to ${to}`)
    return { sent: true }
  } catch (error) {
    console.error('Failed to send notification email:', error)
    return { sent: false, reason: 'send-failed' }
  }
}
