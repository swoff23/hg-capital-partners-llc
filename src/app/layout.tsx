import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";
import { brandTokens, brandTokensDark } from "@/lib/brand-tokens";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// A page's own title reads "Rentals · HG"; pages that set none read "HG Capital".
// The icons are the file conventions beside this layout: icon.svg, icon1.tsx
// (512) and apple-icon.tsx.
export const metadata: Metadata = {
  title: { default: BRAND.app, template: `%s · ${BRAND.mark}` },
  description: `Internal operating system for ${BRAND.app}`,
};

// The browser's own bar takes the chrome's color: --canvas in each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brandTokens.canvas },
    { media: "(prefers-color-scheme: dark)", color: brandTokensDark.canvas },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
