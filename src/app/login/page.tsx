import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/auth-allowlist";
import { prisma } from "@/lib/db";
import { Button, Card, CardBody } from "@/components/ui";
import { devLogin } from "./actions";
import { MagicLinkForm } from "./magic-link";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = (await searchParams) as { error?: string };
  const users = SUPABASE_CONFIGURED ? [] : await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-5 p-6 text-center">
          <div>
            <div className="text-lg font-semibold tracking-tight">HG Capital OS</div>
            <p className="mt-1 text-sm text-muted">Internal operations — sign in to continue</p>
          </div>

          {error === "not_allowed" && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              That email isn&apos;t authorized for HG Capital OS.
            </p>
          )}

          {SUPABASE_CONFIGURED ? (
            <MagicLinkForm />
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
