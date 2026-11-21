import { notFound } from "next/navigation";
import { Monogram } from "@/components/monogram";
import { TextLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { claudeConnectorEnabled, readPendingApproval } from "@/lib/claude/oauth";
import { firstName } from "@/lib/names";
import { APPROVAL_EXPIRED } from "../claude-state";
import { ApproveActions } from "./approve-actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Connect Claude" };

export const dynamic = "force-dynamic";

const GROUPS = [
  { label: "Claude can see", lines: ["Properties, units and tenant names.", "Partners and contractors, with trades, phones and emails."] },
  { label: "Claude can", lines: ["Save draft tasks for you to review."] },
  { label: "Claude can't", lines: ["Add, change or close a task.", "See lockbox codes or money."] },
] as const;

/**
 * Where Claude sends a partner to approve it, at /settings/claude/approve?r=<request id> (docs/specs/tasks-from-claude.md
 * 7.2). One centered card at every size. Nothing from the request is drawn here: the heading names the signed-in
 * partner, and Allow and Cancel send the request id back and the browser only where lib/claude's validated redirect
 * says. Signed out, requireUser goes through /login first and returns here with the same `r`.
 */
export default async function ApproveClaudePage({ searchParams }: PageProps<"/settings/claude/approve">) {
  if (!claudeConnectorEnabled()) notFound();
  const user = await requireUser();
  const { r } = await searchParams;
  const pending = await readPendingApproval(user, r);

  if (pending.state === "expired") {
    return (
      <div className="mx-auto w-full max-w-md space-y-3 rounded-lg border border-border bg-background p-6">
        <h1 className="sr-only">Connect Claude</h1>
        <p className="text-body text-foreground">{APPROVAL_EXPIRED}</p>
        <p className="text-body">
          <TextLink href="/settings/claude" className="inline-flex items-center pointer-coarse:min-h-11">
            Go to Settings
          </TextLink>
        </p>
      </div>
    );
  }

  const first = firstName(pending.userName) || pending.userName;
  return (
    <div className="mx-auto w-full max-w-md space-y-5 rounded-lg border border-border bg-background p-6">
      <div className="flex items-center justify-center gap-2" aria-hidden="true">
        <span className="grid size-8 place-items-center rounded-full border border-border bg-muted text-micro text-foreground">AI</span>
        <span className="h-px w-2 bg-line-strong" />
        <Monogram size={32} />
      </div>
      <h1 className="text-center text-title text-balance text-foreground">{`Let Claude draft tasks for you, ${first}?`}</h1>
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.label} className="space-y-1">
            <h2 className="text-meta text-fg-2">{g.label}</h2>
            {g.lines.map((line) => (
              <p key={line} className="text-body text-foreground">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
      <ApproveActions rid={typeof r === "string" ? r : ""} />
    </div>
  );
}
