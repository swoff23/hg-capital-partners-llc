import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_CONFIGURED, USERS } from "@/lib/auth-allowlist";
import { Button, Card, CardBody, Input } from "@/components/ui";
import { devLogin, login } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = (await searchParams) as { error?: string };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-5 p-6">
          <div className="text-center">
            <div className="text-lg font-semibold tracking-tight">HG Capital OS</div>
            <p className="mt-1 text-sm text-muted">Internal operations — sign in to continue</p>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-center text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {error === "bad" ? "Wrong email or password." : "That account isn't authorized."}
            </p>
          )}

          {AUTH_CONFIGURED ? (
            <form action={login} className="space-y-2">
              <select
                name="email"
                className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm"
              >
                {USERS.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name}
                  </option>
                ))}
              </select>
              <Input name="password" type="password" placeholder="Password" required autoFocus />
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">Dev sign-in — pick a user:</p>
              {USERS.map((u) => (
                <form key={u.email} action={devLogin}>
                  <input type="hidden" name="email" value={u.email} />
                  <Button variant="secondary" className="w-full justify-start" type="submit">
                    {u.name}
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
