"use client";
import { AuthCrash } from "@/app/login/_components/auth-crash";

/** Error boundary for the first-password page, which uses the sign-in frame. */
export default function WelcomeError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <AuthCrash {...props} />;
}
