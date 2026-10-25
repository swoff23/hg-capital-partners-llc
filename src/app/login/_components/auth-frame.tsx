import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";

/**
 * The sign-in screens' shared frame: /login, forgot password, the reset link
 * and the contractor's first-password page. Public palette (CLAUDE.md,
 * Personality), fixed dark, ignores the theme toggle. Feature-only, so it
 * lives beside the login page rather than in src/components.
 */
export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  /** One short heading under the HG Login mark. /login itself has none. */
  title?: string;
  /** One line under the heading. */
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-surface="public" className="flex min-h-screen flex-col bg-[#080b12] text-[#f2f4f7]">
      <PublicHeader />

      <main className="relative isolate flex flex-1 items-center justify-center px-6 py-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_38%,rgba(150,165,195,0.08),transparent_70%)]" />

        <div className="w-full max-w-xs text-center">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">HG Login</p>
          <div className="my-7 h-px w-14 bg-[#c8a765]/40 mx-auto" />

          {title && <h1 className="text-lg font-medium tracking-tight text-[#e8eaee]">{title}</h1>}
          {subtitle && <p className="mt-1.5 text-xs text-[#767d8a]">{subtitle}</p>}

          {children}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

export const authInputClass =
  "h-10 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 text-sm text-[#e8eaee] placeholder:text-[#4c525c] focus:border-[#c8a765]/60 focus:outline-none";

export const authButtonClass =
  "mt-1 h-10 w-full rounded-full bg-[#e8eaee] text-[0.8125rem] font-medium tracking-wide text-[#08090b] transition-colors duration-200 hover:bg-[#c8a765]";

/** Quiet text link under a form ("Forgot password?", "Back to sign in"), with a 44px tap height. */
export const authLinkClass =
  "inline-flex min-h-11 items-center text-xs tracking-wide text-[#767d8a] transition-colors hover:text-[#c8a765]";

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-6 rounded-lg border border-[#e0796a]/25 bg-[#e0796a]/[0.08] px-3 py-2 text-xs text-[#e5a99b]"
    >
      {children}
    </p>
  );
}

/** A neutral confirmation ("Password changed."), in the gold accent. */
export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mt-6 rounded-lg border border-[#c8a765]/25 bg-[#c8a765]/[0.08] px-3 py-2 text-xs text-[#dcc28f]"
    >
      {children}
    </p>
  );
}
