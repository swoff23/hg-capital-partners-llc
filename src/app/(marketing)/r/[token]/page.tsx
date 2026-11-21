import Link from "next/link";
import { notFound } from "next/navigation";
import { publicCtaClass, publicType } from "@/components/public/ui";
import { resolveResidentLink } from "@/lib/residents/links";
import { residentHome } from "@/lib/residents/emails";
import { householdRequests } from "@/lib/residents/requests";
import { cn } from "@/lib/utils";
import { residentColumn } from "./_components/column";
import { RequestRows } from "./_components/request-rows";

/**
 * Their home (docs/specs/maintenance-requests.md, section 3.1): "Hi Dana", the
 * home, Report a problem, then the household's Open and Done requests. No list
 * yet: just the button.
 */
export default async function ResidentHome({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const link = await resolveResidentLink(token);
  if (!link || link.state !== "live") notFound();
  const { ctx } = link;
  const rows = await householdRequests(ctx);
  const open = rows.filter((r) => r.step === "received" || r.step === "scheduled");
  const done = rows.filter((r) => r.step === "done" || r.step === "closed");
  return (
    <main className={cn(residentColumn, "py-8 sm:py-10")}>
      <h1 className={cn(publicType.heading, "text-foreground")}>Hi {ctx.firstName}</h1>
      <p className={cn(publicType.meta, "mt-1 text-muted-foreground")}>{residentHome(ctx.address, ctx.unitLabel)}</p>
      <Link href={`/r/${token}/new`} className={cn(publicCtaClass, "mt-6 w-full")}>
        Report a problem
      </Link>
      <RequestRows token={token} title="Open" rows={open} />
      <RequestRows token={token} title="Done" rows={done} />
    </main>
  );
}
