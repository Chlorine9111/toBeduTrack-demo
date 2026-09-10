import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Inter,
  Noto_Sans_SC,
  Playfair_Display,
  JetBrains_Mono,
} from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AppI18nProvider } from "@/lib/app-i18n/provider";
import { APP_LOCALE_COOKIE, coerceAppLocale } from "@/lib/app-i18n/types";
import { GlobalProviders } from "@/components/shells/GlobalProviders";
import { WebVitals } from "@/components/shells/WebVitals";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600"],
  variable: "--font-cjk",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-serif",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-mono",
});

const defaultUrl = process.env.NEXT_PUBLIC_APP_URL
  ? process.env.NEXT_PUBLIC_APP_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://127.0.0.1:3001";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Deskmate",
  description:
    "面向教师的 AI 教学工作台，覆盖自主 Agent、内容库、教案、Rubric 与教学资料协作。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = coerceAppLocale(cookieStore.get(APP_LOCALE_COOKIE)?.value);

  return (
    <html lang={initialLocale === "en" ? "en" : "zh-CN"} suppressHydrationWarning>
      <body
          className={`${inter.variable} ${notoSansSC.variable} ${playfairDisplay.variable} ${jetbrainsMono.variable} antialiased`}
        >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <WebVitals />
          <AppI18nProvider initialLocale={initialLocale}>
            <GlobalProviders>
              {children}
            </GlobalProviders>
          </AppI18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
