# 🧠 منصة e-learn | ساحة العباقرة

> منصة عربية متكاملة لتدريب الأطفال على الحساب الذهني، المسابقات الحية، تحديات الذكاء الاصطناعي، ومولّد الامتحانات — مُعاد بناؤها من مشروع PHP قديم (~17,500 سطر) إلى نسخة حديثة بـ **Next.js 16 + Supabase Postgres + Vercel**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

---

## 🎯 المميزات

- **4 ألعاب تدريب**: جمع وطرح، ضرب، قسمة، أباكوس (سوروبان) — تصحيح أمني على الخادم.
- **PVP مباشر**: مباريات حية بين اللاعبين عبر Socket.io + Supabase Realtime fallback.
- **تحدي الذكاء الاصطناعي**: لاعب آلي ذكي مع حدود يومية.
- **مولّد امتحانات PDF**: 5 خطوات، اختياري توليد بالـ AI، تصدير PDF.
- **محفظة وسحب**: نقاط، تحويل لنقود، OTP للسحب، موافقات إدارية.
- **إشعارات FCM**: بث عام + موجه، دعم أجهزة متعددة.
- **لوحات إدارة**: مستخدمون، مدرّبون، ساحة، سحوبات، إشعارات، امتحانات، إحصائيات.
- **ثنائي اللغة (عربي/إنجليزي)**: RTL افتراضي، خطوط Cairo + Chakra Petch.
- **وضع فاتح/داكن**: next-themes، زرّ تبديل بدون hydration mismatch.

## 🏗️ البنية التقنية

| الطبقة | التقنية |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| UI | Tailwind CSS 4 + shadcn/ui (New York) + Lucide + Framer Motion |
| Database | Supabase Postgres (pgbouncer pooler + session mode) |
| ORM | Prisma 6 (postgresql provider) |
| Auth | JWT (jose) + bcrypt + httpOnly cookie + OTP in DB |
| Realtime | Socket.io mini-service (port 3003) via gateway `?XTransformPort` |
| Email | Resend (transactional) |
| Push | Firebase Admin (FCM topics) |
| Rate limit | Upstash Redis (optional, in-memory fallback) |
| Hosting | Vercel |

## 🔒 إصلاحات الأمان الحرجة (مقارنة بالنسخة PHP القديمة)

1. ✅ كلمات المرور بـ bcrypt (لا نص صريح).
2. ✅ جميع الأسرار في متغيرات بيئة (لا hardcoded credentials).
3. ✅ CSRF عبر SameSite cookies + JWT.
4. ✅ `isCorrect` يُشتق على الخادم (لا ثقة بالعميل).
5. ✅ مفتاح إجابات PVP لا يُرسل للعميل.
6. ✅ OTP في DB مع TTL (5 دقائق) وحدّ المحاولات (5).
7. ✅ `===` بدل `==` في فحص OTP.
8. ✅ Cron للحساب اليومي خارج دورة الطلب (mini-service).
9. ✅ Realtime عبر Socket.io بدل polling كل ثانية.
10. ✅ HTML الإشعارات مُنظّف (لا XSS من Summernote).

## 🚀 التشغيل محلياً

### المتطلبات
- Node.js 20+ أو Bun
- حساب Supabase (أو أي Postgres)

### الخطوات

```bash
# 1. تثبيت الحزم
bun install

# 2. إعداد متغيرات البيئة
cp .env.example .env
# عدّل .env وضع بيانات Supabase الخاصة بك

# 3. توليد Prisma Client + رفع المخطط
bun run db:generate
bun run db:push

# 4. بذرة البيانات (admin + student + trainer + settings + welcome notification)
bun run src/scripts/seed.ts

# 5. تشغيل خادم التطوير
bun run dev
# افتح http://localhost:3000
```

**بيانات الدخول الافتراضية (من seed):**
- Admin: `admin / admin123456`
- Student: `student / student123`

### Mini-service (Socket.io لـ PVP realtime)

```bash
cd mini-services/chat-service
bun install
bun run dev  # يعمل على المنفذ 3003
```

## 🌐 النشر على Vercel + Supabase

### 1. Supabase (قاعدة البيانات)
1. أنشئ مشروعاً على [supabase.com](https://supabase.com).
2. احفظ: Project ref, Database password, Service role key, Anon key.
3. ستحتاج connection string بصيغة pooler:
   - **DATABASE_URL** (Transaction mode, port 6543, pgbouncer=true)
   - **DIRECT_URL** (Session mode, port 5432, no pgbouncer)

### 2. رفع المخطط إلى Supabase
```bash
# من محلياً بـ DATABASE_URL + DIRECT_URL指向 Supabase
bun run db:push
bun run src/scripts/seed.ts
```

### 3. Vercel (الاستضافة)
1. اذهب إلى [vercel.com/new](https://vercel.com/new) وارفع المستودع.
2. أضف Environment Variables في Project Settings:
   ```
   DATABASE_URL, DIRECT_URL, JWT_SECRET,
   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
   NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_BASE_URL, NEXT_PUBLIC_SOCKET_PORT
   ```
3. Deploy. ✅

> **ملاحظة عن Cookie**: التطبيق يكشف `x-forwarded-proto` ليعتمد `SameSite=None; Secure` على HTTPS (ضروري للعمل داخل preview iframe) و`SameSite=Lax` على HTTP localhost.

## 📁 بنية المشروع

```
src/
├── app/
│   ├── page.tsx                 # الصفحة الوحيدة المرئية (/) — SPA router
│   ├── layout.tsx               # الخطوط (Cairo + Chakra Petch), Toaster, Providers
│   ├── globals.css              # Tailwind 4 + glass-morphism + RTL
│   └── api/                     # Route handlers (auth, trainings, pvp, wallet, admin…)
├── components/
│   ├── ui/                      # shadcn/ui (New York)
│   ├── views/                   # عرض لكل "صفحة" (landing, login, dashboard, admin-*, …)
│   ├── game/                    # ألعاب التدريب الأربعة
│   ├── arena-background.tsx     # خلفية الرموز الرياضية المتحركة (client-only)
│   ├── theme-toggle.tsx         # زرّ الوضع الفاتح/الداكن
│   ├── auth-context.tsx         # React Query للـ auth state
│   └── providers.tsx            # ThemeProvider + QueryClientProvider + SocketProvider
├── lib/
│   ├── auth.ts                  # JWT + bcrypt + cookie (SameSite=None على HTTPS)
│   ├── db.ts                    # Prisma client singleton
│   ├── env.ts                   # zod schema لكل env vars
│   ├── api.ts                   # helpers (ok/fail/requireUser/requireAdmin/ratelimit)
│   └── ...
├── scripts/seed.ts              # بذرة admin/student/trainer/settings
mini-services/
└── chat-service/                # Socket.io لـ PVP realtime (port 3003)
prisma/
└── schema.prisma                # 13 جدولاً، provider=postgresql
```

## 📜 الترخيص

هذا المشروع مُخصّص لمنصة e-learn التعليمية. حقوق النشر © 2027.

---

**طوّره فريق e-learn** — [github.com/Baher427/e-learn](https://github.com/Baher427/e-learn)
