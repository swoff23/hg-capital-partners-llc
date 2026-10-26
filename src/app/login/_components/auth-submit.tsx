"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { authButtonClass } from "./auth-frame";

/**
 * The sign-in screens' submit button: the app's `Button` with its `pending`
 * look (forms 2.7), so while the form is on its way it keeps its label, turns
 * busy and shows the spinner, and a slow connection doesn't invite a second
 * tap. The label never changes to "Signing in…".
 *
 * useFormStatus follows a form whose action is a server action. `native` is
 * for a form that posts to a URL (the reset link's, see reset/submit), which
 * React doesn't follow: the button holds from the submit event until the page
 * is replaced, and lets go if the browser brings the page back from its cache.
 */
export function AuthSubmit({ children, native = false }: { children: React.ReactNode; native?: boolean }) {
  const { pending } = useFormStatus();
  const [posted, setPosted] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!native || !form) return;
    const onSubmit = (e: Event) => {
      // A form the page stopped (a password that's too short) isn't on its way anywhere. React's own
      // handler runs after this one, so look once the event is through.
      setTimeout(() => {
        if (!e.defaultPrevented) setPosted(true);
      }, 0);
    };
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

  return (
    <Button ref={ref} type="submit" className={authButtonClass} pending={pending || posted}>
      {children}
    </Button>
  );
}
