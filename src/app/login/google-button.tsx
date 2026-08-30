"use client";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function GoogleSignInButton() {
  async function signIn() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }
  return (
    <Button className="w-full" onClick={signIn}>
      Sign in with Google
    </Button>
  );
}
