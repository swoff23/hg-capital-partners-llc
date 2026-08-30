import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/auth-allowlist";
import { prisma } from "@/lib/db";
import { Button, Card, CardBody } from "@/components/ui";
import { devLogin } from "./actions";
import { GoogleSignInButton } from "./google-button";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const users = SUPABASE_CONFIGURED ? [] : await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-5 p-6 text-center">
          <div>
            <div className="text-lg font-semibold tracking-tight">HG Capital OS</div>
            <p className="mt-1 text-sm text-muted">Internal operations — sign in to continue</p>
          </div>

          {SUPABASE_CONFIGURED ? (
            <GoogleSignInButton />
          ) : (
            <div className="space-y-2 text-left">
              <p className="text-xs text-muted">
                Supabase isn&apos;t configured — dev sign-in. Pick a user:
              </p>
              {users.map((u) => (
                <form key={u.id} action={devLogin}>
                  <input type="hidden" name="email" value={u.email} />
                  <Button variant="secondary" className="w-full justify-start" type="submit">
                    {u.name} <span className="text-muted">· {u.email}</span>
                  </Button>
                </form>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
