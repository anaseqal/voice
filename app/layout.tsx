import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  isRtl,
  type Locale,
} from "@/lib/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "voice.ihub2",
  description: "Singer voice cloning",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = await getMessages();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
            <Toaster richColors position={dir === "rtl" ? "top-left" : "top-right"} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
