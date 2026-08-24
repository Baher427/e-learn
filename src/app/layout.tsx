import type { Metadata, Viewport } from "next";
import { Cairo, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["arabic", "latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "منصة e-learn | روّاد الحساب الذهني وتنمية الذكاء",
    template: "%s | منصة e-learn",
  },
  description:
    "منصة e-learn هي البيئة التعليمية الأحدث لتدريب الحساب الذهني وتطوير القدرات العقلية للأطفال. ندمج بين الرياضة الذهنية والصحة النفسية من خلال منافسات حية، مناهج عالمية، وتحديات ذكاء اصطناعي لبناء جيل من العباقرة.",
  keywords: [
    "منصة تعليمية",
    "حساب ذهني",
    "رياضيات",
    "تدريب عقلي",
    "تعليم إلكتروني",
    "أطفال",
    "ذكاء",
    "سوروبان",
    "أباكوس",
    "جمع وطرح",
    "ضرب وقسمة",
    "مسابقات",
    "تحديات",
  ],
  authors: [{ name: "e-learn Team" }],
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ar_EG",
    title: "منصة e-learn | بوابتك لصناعة العباقرة",
    description:
      "انضم لأقوى مجتمع للحساب الذهني. تدريبات تفاعلية ومسابقات حية تنتظرك!",
    siteName: "e-learn",
  },
  twitter: {
    card: "summary_large_image",
    title: "منصة e-learn | تحدي العقول",
    description: "تحديات حساب ذهني يومية وجوائز للمتفوقين. سجّل الآن!",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#f1f5f9" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} ${chakra.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <Providers>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
