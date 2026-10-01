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

  // Clean, minimal, editorial — matching the site: warm paper, ink, hairlines,
  // a serif heading and a quiet green link. No emoji, no gimmicks.
  const serif = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
  const sans =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

  const html = `
  <div style="margin:0;padding:0;background:#f4f3f0;">
    <div style="max-width:520px;margin:0 auto;padding:48px 28px;font-family:${sans};color:#121109;">
      <p style="margin:0 0 20px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b675d;">Guestbook</p>

      <h1 style="margin:0 0 24px;font-family:${serif};font-weight:500;font-size:26px;line-height:1.2;letter-spacing:-0.01em;color:#121109;">
        Sushanka replied to your message.
      </h1>

      <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#121109;">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#6b675d;">
        Thanks for signing the guestbook. I just left you a reply.
      </p>

      ${
        originalMessage
          ? `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b675d;">Your message</p>
             <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#6b675d;">${escapeHtml(originalMessage)}</p>`
          : ''
      }

      <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b675d;">The reply</p>
      <p style="margin:0 0 32px;font-size:16px;line-height:1.7;color:#121109;">${escapeHtml(reply) || 'See the reply on the site.'}</p>

      <p style="margin:0 0 36px;">
        <a href="${link}" style="color:#256b47;text-decoration:none;font-size:15px;border-bottom:1px solid #256b47;padding-bottom:2px;">
          View on the site &rarr;
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #dddad3;margin:0 0 16px;" />
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b675d;">
        Sent because you signed the guestbook at sushanka.com.np.
      </p>
    </div>
  </div>
  `

  try {
    await transporter.sendMail({
      from: `"Sushanka Lamichhane" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    })
    console.log(`Notification email sent to ${to}`)
    return { sent: true }
  } catch (error) {
    console.error('Failed to send notification email:', error)
    return { sent: false, reason: 'send-failed' }
  }
}
