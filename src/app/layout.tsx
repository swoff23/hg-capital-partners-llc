import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT, ThemeFallback } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";
import { brandTokens, brandTokensDark } from "@/lib/brand-tokens";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The "%s · HG" template is for pages that set a plain title ("Tasks" would
// read "Tasks · HG"); pages that set none read "HG Capital". The public, login
// and portal titles are absolute ("Rentals | HG Capital Partners"), and the
// portal layout gives its pages its own template, so none of them gain
// " · HG". The icons are the file conventions beside this layout: icon.svg,
// icon1.tsx (512) and apple-icon.tsx.
export const metadata: Metadata = {
  title: { default: BRAND.app, template: `%s · ${BRAND.mark}` },
  description: `Internal operating system for ${BRAND.app}`,
};

// The browser's own bar takes the chrome's color: --canvas in each theme.
// THEME_SCRIPT points it at the app's theme when that differs from the OS's.
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
      <body className="min-h-full">
        <ThemeFallback />
        {children}
      </body>
    </html>
  );
}
