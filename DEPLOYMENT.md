# 🚀 دليل النشر على Vercel + Supabase

> هذا الدليل يشرح كيف تنشر منصة e-learn على Vercel (الاستضافة) مع Supabase (قاعدة البيانات).

## ✅ المتطلبات

1. حساب [Vercel](https://vercel.com) (مجاني).
2. مشروع [Supabase](https://supabase.com) (مُنشأ بالفعل في حالتنا — `zqaqaiaebfrqrrkgfkof`).
3. المستودع على GitHub: [Baher427/e-learn](https://github.com/Baher427/e-learn) (مُنشأ بالفعل).

---

## 1️⃣ رفع مخطط قاعدة البيانات إلى Supabase

إذا لم تكن قد رفعت المخطط بعد (لقد رفعناه بالفعل في هذا الدليل)، يمكنك إعادة الرفع هكذا:

```bash
# محلياً، مع ضبط متغيرات البيئة على Supabase:
export DATABASE_URL='postgresql://postgres.zqaqaiaebfrqrrkgfkof:E-LEARN_2003@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1'
export DIRECT_URL='postgresql://postgres.zqaqaiaebfrqrrkgfkof:E-LEARN_2003@aws-0-eu-west-2.pooler.supabase.com:5432/postgres'

# رفع المخطط (13 جدولاً)
bun run db:push

# بذرة البيانات (admin + student + trainer + settings + welcome notification)
bun run src/scripts/seed.ts
```

---

## 2️⃣ النشر على Vercel

### الخيار A: زر "Deploy with Vercel" (الأسهل)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Baher427/e-learn&project-name=e-learn&repository-name=e-learn)

عند الضغط:
1. سيسألك Vercel عن **Environment Variables** — استخدم القيم من الجدول أدناه.
2. اضغط **Deploy** وانتظر 2-3 دقائق.

### الخيار B: استيراد يدوي من Vercel Dashboard

1. اذهب إلى [vercel.com/new](https://vercel.com/new).
2. ابحث عن مستودع `Baher427/e-learn` (أو استورد من GitHub).
3. في خطوة **Configure Project**:
   - **Framework Preset**: Next.js (سيُكتشف تلقائياً).
   - **Build Command**: يُترك افتراضياً (`prisma generate && next build` من vercel.json).
   - **Install Command**: `bun install`.
4. في **Environment Variables**, أضف المفاتيح التالية:

---

## 3️⃣ متغيرات البيئة على Vercel

انسخ هذه القيم بالضبط إلى **Project Settings → Environment Variables** على Vercel:

### الأساسية (مطلوبة)

| Key | Value | Environment |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.zqaqaiaebfrqrrkgfkof:E-LEARN_2003@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` | Production + Preview |
| `DIRECT_URL` | `postgresql://postgres.zqaqaiaebfrqrrkgfkof:E-LEARN_2003@aws-0-eu-west-2.pooler.supabase.com:5432/postgres` | Production + Preview |
| `JWT_SECRET` | `elearn-supabase-prod-jwt-secret-2027-change-me-32chars` (بدّله بقيمة عشوائية قوية ≥ 32 حرفاً) | All |
| `NEXT_PUBLIC_APP_NAME` | `e-learn` | All |
| `NEXT_PUBLIC_BASE_URL` | `https://your-project.vercel.app` (بدّله باسم مشروعك على Vercel) | Production |
| `NEXT_PUBLIC_SOCKET_PORT` | `3003` | All |
| `SUPABASE_URL` | `https://zqaqaiaebfrqrrkgfkof.supabase.co` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxYXFhaWFlYmZycXJya2dma29mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU1NjMxMywiZXhwIjoyMTAzMTMyMzEzfQ.0UJHzKjaQroCnGt56ZWC01Zb5VRGeDCVQ5utYPGmnmQ` | All (server-only) |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxYXFhaWFlYmZycXJya2dma29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NTYzMTMsImV4cCI6MjEwMzEzMjMxM30.UGt6z35npv7Ae1TaHitb8yWgXn_t9tCMYU3tE7FcM8s` | All |

### الاختيارية (للإيميل والإشعارات)

| Key | Value | ملاحظة |
|---|---|---|
| `RESEND_API_KEY` | (من [resend.com](https://resend.com)) | إرسال OTP + إشعارات بريدية |
| `EMAIL_FROM` | `e-learn <onboarding@resend.dev>` | عنوان المُرسِل |
| `FIREBASE_PROJECT_ID` | (من Firebase console) | FCM push notifications |
| `FIREBASE_CLIENT_EMAIL` | `...@...iam.gserviceaccount.com` | |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` | multiline |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIza...` | client-side |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123:web:abc` | client-side |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | `BHr...` | web push |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `1234567890` | client-side |
| `UPSTASH_REDIS_REST_URL` | `https://...upstash.io` | rate limiting (optional) |
| `UPSTASH_REDIS_REST_TOKEN` | `AVAC_...` | rate limiting (optional) |

> ⚠️ **تحذير أمني**: لا تضع أي `NEXT_PUBLIC_*` secret للخدمات الحساسة. هذه المفاتيح تُكشف للمتصفح. فقط مفاتيح Supabase Anon و Firebase Client آمنة للعميل.

---

## 4️⃣ بعد النشر — تحقق

بعد نجاح النشر، افتح رابط Vercel وتحقق:

1. **الصفحة الرئيسية**: `https://your-project.vercel.app/` — يجب أن تظهر صفحة الهبوط العربية مع رموز الخلفية المتحركة.
2. **تسجيل دخول الأدمن**:
   - اضغط "تسجيل الدخول"
   - اسم المستخدم: `admin`، كلمة المرور: `admin123456`
   - يجب أن يُحوَّل إلى لوحة إدارة المستخدمين.
3. **تسجيل دخول الطالب**: `student / student123` → لوحة الطالب مع 4 ألعاب تدريب.

---

## 5️⃣ ملاحظات تقنية مهمة

### الكوكيز والـ iframe
يعمل التطبيق داخل preview iframe (third-party). لذلك نُصدر `SameSite=None; Secure` على HTTPS (يُكتشف عبر `x-forwarded-proto` من gateway). هذا ضروري ليعمل login. على HTTP localhost، نُبقي `SameSite=Lax`.

### Pooler الاتصال
- `DATABASE_URL` يستخدم pooler **Transaction mode** (port 6543, `pgbouncer=true`) — مثالي لـ Vercel serverless.
- `DIRECT_URL` يستخدم pooler **Session mode** (port 5432) — لـ Prisma migrate/db push.
- كلاهما عبر `aws-0-eu-west-2.pooler.supabase.com` لأن الـ direct URL `db.{ref}.supabase.co` IPv6-only على المشاريع الحديثة.

### Mini-service (Socket.io لـ PVP)
الـ mini-service على المنفذ 3003 غير مشمول في نشر Vercel (Vercel serverless لا يدعم socket.io طويل الأمد). لتشغيل PVP في الإنتاج:
- استضاف mini-service على Render/Railway/Fly.io.
- أو بدّل إلى Supabase Realtime (مفاتيحه مضبوطة في env).

### بيانات الدخول الافتراضية
- Admin: `admin / admin123456`
- Student: `student / student123`

⚠️ **بدّل كلمات المرور فور النشر** عبر لوحة الإدارة.

---

## 6️⃣ حل المشكلات

| المشكلة | الحل |
|---|---|
| `P1001: Can't reach database server` | استخدم pooler URLs (aws-0-...pooler.supabase.com) بدل db.{ref}.supabase.co |
| `Hydration mismatch` | تأكد أن `useIsMounted` hook مستخدم في أي مكوّن يستخدم Math.random أو next-themes |
| Login لا يعمل بعد النشر | تحقق أن `x-forwarded-proto` يصل إلى التطبيق (Vercel يضبطه تلقائياً على HTTPS) |
| `prisma generate` غير مُشغّل | vercel.json يحتوي `buildCommand: "prisma generate && next build"` |

---

**طوّره فريق e-learn** — [github.com/Baher427/e-learn](https://github.com/Baher427/e-learn)
