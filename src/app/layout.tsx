import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { siteConfig } from "@/lib/site-config";
import { SwRegister } from "@/components/SwRegister";
import { DISPLAY_PREFS_BOOT_SCRIPT } from "@/lib/display-prefs";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Find therapy and developmental-care centers near you`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: "en_PH",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the boot script below stamps data-* display
    // preferences on <html> before React hydrates.
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies saved display preferences before first paint so users
            who chose "reduce motion" or "larger text" never see a flash.
            CSP allows inline scripts (next.config.ts); a nonce would force
            dynamic rendering and break ISR. */}
        <script
          dangerouslySetInnerHTML={{ __html: DISPLAY_PREFS_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SwRegister />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
