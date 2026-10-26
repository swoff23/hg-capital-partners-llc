import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";
import { Eyebrow, publicContainer, publicCtaClass, publicLinkHover, publicType } from "@/components/public/ui";
import { cn } from "@/lib/utils";

/**
 * The sign-in screens' shared frame: /login, forgot password, the reset link
 * and the contractor's first-password page. The public site's material
 * (docs/brand-guidelines.md, sections 4 and 10): the app's dark theme, fixed,
 * whatever the theme toggle says. Feature-only, so it lives beside the login
 * page rather than in src/components.
 */
export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  /** One short heading under the HG Login eyebrow. /login itself has none, so the eyebrow is its h1. */
  title?: string;
  /** One line under the heading. */
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-surface="public" className="flex min-h-screen flex-col bg-canvas text-fg-1">
      <PublicHeader />

      <main className={cn(publicContainer, "flex flex-1 flex-col items-center justify-center py-16")}>
        <div className="w-full max-w-sm text-center">
          <Eyebrow as={title ? "p" : "h1"}>HG Login</Eyebrow>

          {title && <h1 className={cn(publicType.heading, "mt-3 text-fg-1")}>{title}</h1>}
          {subtitle && <p className="mt-1.5 text-meta text-fg-3">{subtitle}</p>}

          {children}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

/*
 * A sign-in field's visible label, above the field (Apple HIG; WCAG 3.3.2, a
 * placeholder is not a label), is the app's `FormField`: text-meta 500 in
 * --fg-2, 6px over the field, and a line under it for what to enter.
 */

/** For the app's `Input` in the public material: 40px to match the CTA, placeholders in --pub-faint. */
export const authInputClass = "h-10 placeholder:text-pub-faint";

/** The public CTA, full width. */
export const authButtonClass = cn(publicCtaClass, "mt-1 w-full");

/** Quiet text link under a form ("Forgot password?", "Back to sign in"), with a 44px tap height. */
export const authLinkClass = cn("inline-flex min-h-11 items-center text-meta text-fg-3", publicLinkHover);

/** A form-level error ("Wrong email or password."): the notice box with the line in --danger. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-6 rounded-md border border-line bg-surface px-3 py-2 text-meta text-danger">
      {children}
    </p>
  );
}

/** A neutral confirmation ("Password changed."): --surface on a --line edge in --fg-1. Gold never marks state. */
export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-6 rounded-md border border-line bg-surface px-3 py-2 text-meta text-fg-1">
      {children}
    </p>
  );
}
