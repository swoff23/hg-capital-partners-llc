"use client";
import { AuthCrash } from "./_components/auth-crash";

/** Error boundary for /login, forgot password and the reset link: stays in the sign-in frame. */
export default function LoginError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <AuthCrash {...props} />;
}
