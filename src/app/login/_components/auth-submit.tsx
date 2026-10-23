"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { authButtonClass } from "./auth-frame";

/**
 * The sign-in screens' submit button. While the form is on its way it's
 * disabled and says so ("Signing in…"), the Pending action pattern in
 * docs/components.md, so a slow connection doesn't invite a second tap.
 *
 * useFormStatus follows a form whose action is a server action. `native` is
 * for a form that posts to a URL (the reset link's, see reset/submit), which
 * React doesn't follow: the button holds from the submit event until the page
 * is replaced, and lets go if the browser brings the page back from its cache.
 */
export function AuthSubmit({
  children,
  pendingLabel,
  native = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  native?: boolean;
}) {
  const { pending } = useFormStatus();
  const [posted, setPosted] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!native || !form) return;
    const onSubmit = () => setPosted(true);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPosted(false);
    };
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [native]);

  const busy = pending || posted;
  return (
    <button ref={ref} type="submit" disabled={busy} className={authButtonClass}>
      {busy ? pendingLabel : children}
    </button>
  );
}
