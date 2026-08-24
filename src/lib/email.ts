/**
 * Email service — uses Resend in production (env RESEND_API_KEY),
 * falls back to console logging in dev so OTP flows can be tested
 * without any external account.
 */
import { env, isProd } from '@/lib/env'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export interface SendEmailResult {
  ok: boolean
  error?: string
  /** True when no mail provider is configured and the message was
   *  only logged to the server console (dev/no-email setups). */
  devFallback?: boolean
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    // Dev fallback — print to console so you can grab the OTP
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📧 EMAIL to: ${input.to}`)
    console.log(`Subject: ${input.subject}`)
    console.log('---')
    console.log(input.html.replace(/<[^>]+>/g, ''))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return { ok: true, devFallback: true }
  }

  try {
    const { default: Resend } = await import('resend')
    const resend = new Resend(env.RESEND_API_KEY)
    await resend.emails.send({
      from: env.EMAIL_FROM || 'e-learn <onboarding@resend.dev>',
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown email error' }
  }
}

export function otpEmailTemplate(opts: {
  code: string
  purpose: 'register' | 'login_force' | 'withdrawal' | 'password_reset'
  username?: string
}): string {
  const purposeText: Record<typeof opts.purpose, string> = {
    register: 'تأكيد إنشاء حسابك الجديد',
    login_force: 'تأكيد الدخول من جهاز جديد',
    withdrawal: 'تأكيد طلب سحب النقاط',
    password_reset: 'إعادة تعيين كلمة المرور',
  }
  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Cairo',sans-serif;background:#0f172a;padding:24px;margin:0">
  <div style="max-width:500px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.1)">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px">🧠</div>
      <h2 style="color:#e0e7ff;margin:8px 0 0 0">منصة e-learn</h2>
    </div>
    <p style="color:#cbd5e1;text-align:center">${purposeText[opts.purpose]}</p>
    <div style="background:linear-gradient(135deg,#4f46e5,#4338ca);color:white;font-size:36px;font-weight:bold;letter-spacing:8px;padding:20px;border-radius:12px;text-align:center;margin:24px 0;font-family:'Chakra Petch',monospace">
      ${opts.code}
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center">
      هذا الرمز صالح لمدة 5 دقائق فقط. إن لم تطلب هذا الرمز، تجاهل هذه الرسالة.
    </p>
  </div>
</body>
</html>`
}
