import nodemailer from 'nodemailer'

export async function sendNotificationEmail({
  to,
  subject,
  message,
  link
}: {
  to: string
  subject: string
  message: string
  link: string
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP_USER or SMTP_PASS not set in environment variables. Cannot send email.')
    return
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

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
  } catch (error) {
    console.error('Failed to send notification email:', error)
  }
}
