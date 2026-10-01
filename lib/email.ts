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

export async function sendNotificationEmail({
  to,
  subject,
  message,
  link,
}: {
  to: string
  subject: string
  message: string
  link: string
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

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #333;">New activity on your Guestbook entry!</h2>
      <hr style="border: none; border-top: 1px solid #eee;" />
      <p>${message}</p>
      <div style="margin-top: 24px;">
        <a href="${link}" style="background-color: #2078f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          View on Website
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin-top: 24px;" />
      <p style="font-size: 12px; color: #999;">Sent from Sushanka's Portfolio</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: `"Sushanka Portfolio" <${process.env.SMTP_USER}>`,
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
