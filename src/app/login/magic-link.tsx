"use client";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMsg(error.message);
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <p className="text-sm text-muted">
        Check <span className="font-medium text-foreground">{email}</span> for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={send} className="space-y-2 text-left">
      <Input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {state === "error" && <p className="text-xs text-red-600">{msg}</p>}
    </form>
  );
}
