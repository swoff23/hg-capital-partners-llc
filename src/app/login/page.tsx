import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { afterStaffSignIn, staffReturnPath } from "@/lib/next-path";
import { portalReturnPath } from "@/lib/portal/next-path";
import { portalHomePath } from "@/lib/portal/session";
import { AuthFrame, authLinkClass } from "./_components/auth-frame";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: "Sign In | HG Capital Partners",
  description: "Internal operations sign-in.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { notice, next: rawNext } = (await searchParams) as { notice?: string; next?: string };
  // The page a signed-out visitor was sent here from: a staff page
  // (src/lib/next-path.ts) or a /p page (src/lib/portal/next-path.ts). The
  // two never overlap, and each kind of account only follows its own.
  const staffNext = staffReturnPath(rawNext);
  if (await getCurrentUser()) redirect(afterStaffSignIn(staffNext));
  const portalEnabled = getEnv().portalEnabled;
  const portalNext = portalEnabled ? portalReturnPath(rawNext) : null;
  const portalHome = await portalHomePath(portalNext);
  if (portalHome) redirect(portalHome);

  return (
    <AuthFrame>
      <LoginForm next={portalNext ?? staffNext} passwordChanged={notice === "reset"} />

      {portalEnabled && (
        <p className="mt-3">
          <Link href="/login/forgot" className={authLinkClass}>
            Forgot password?
          </Link>
        </p>
      )}
    </AuthFrame>
  );
}
