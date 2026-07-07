import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const { email, projectName, inviterEmail } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const { data, error } = await resend.emails.send({
      from: 'Nichii Investment Ltd <onboarding@resend.dev>',
      to: email,
      subject: `You've been invited to "${projectName}" on Nichii Investment Ltd`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <div style="background: #1a1a1a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Nichii Investment Ltd</h1>
            <p style="color: #999; margin: 4px 0 0; font-size: 13px;">Project Manager</p>
          </div>
          <h2 style="color: #1a1a1a; font-size: 18px;">You've been invited to a project</h2>
          <p style="color: #555; line-height: 1.6;">
            <strong>${inviterEmail || 'Someone'}</strong> has invited you to collaborate on 
            <strong>"${projectName}"</strong> on Nichii Investment Ltd.
          </p>
          <p style="color: #555; line-height: 1.6;">
            To get started, sign up or sign in at the link below:
          </p>
          <a href="https://niche-construction.vercel.app/auth" 
             style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; margin: 8px 0;">
            Open Nichii Investment Ltd
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            Once you sign up with this email address, the project will automatically appear in your sidebar.
          </p>
        </div>
      `
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
