import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";
import { notFound } from "next/navigation";
import { publicType } from "@/components/public/ui";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import { GROUP_CHAT_LINE, residentHome } from "@/lib/residents/emails";
import { resolveResidentLink } from "@/lib/residents/links";
import { requestView, type ResidentFile } from "@/lib/residents/requests";
import { cn } from "@/lib/utils";
import { residentColumn } from "../_components/column";
import { Steps } from "../_components/steps";
import { AddMore, CancelRequest } from "./request-actions";

export const metadata: Metadata = { title: "Your request" };

/**
 * One request (docs/specs/maintenance-requests.md, section 3.4; drawing 07 A):
 * their words, the three steps with their days, and what they sent. Add photos
 * or a note while it's open; Cancel this request while it shows Received. Only
 * the household's own words and files, never staff's.
 */
export default async function RequestPage({ params }: PageProps<"/r/[token]/[requestId]">) {
  const { token, requestId } = await params;
  const link = await resolveResidentLink(token);
  if (!link || link.state !== "live") notFound();
  const v = await requestView(link.ctx, requestId);
  if (!v) notFound();
  const today = todayYmdEastern();
  const day = (d: string | null, weekday = false) => (d ? fmtDay(d, { weekday, year: "auto", now: today }) : null);
  const closedLine = v.step === "closed" ? (v.canceledByResident ? null : (v.closedNote ?? GROUP_CHAT_LINE)) : null;
  return (
    <main className={cn(residentColumn, "py-8 sm:py-10")}>
      <Link href={`/r/${token}`} className="text-meta text-muted-foreground pointer-fine:hover:text-foreground">
        ‹ My requests
      </Link>
      <h1 className={cn(publicType.heading, "mt-3 text-foreground [overflow-wrap:anywhere]")}>{v.whatsWrong}</h1>
      <p className={cn(publicType.meta, "mt-1 text-muted-foreground")}>{residentHome(link.ctx.address, link.ctx.unitLabel)}</p>

      <Steps
        className="mt-6"
        steps={[
          { label: "Received", day: day(v.receivedOn), reached: true },
          v.step === "closed"
            ? { label: "Closed", day: day(v.closedOn), reached: true, note: closedLine }
            : { label: "Scheduled", day: day(v.scheduledDay, true), reached: v.step === "scheduled" || v.step === "done" },
          ...(v.step === "closed" ? [] : [{ label: "Done", day: day(v.closedOn), reached: v.step === "done" }]),
        ]}
      />

      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-label text-muted-foreground">Additional comments</h2>
        {v.details && <p className="mt-2 text-body whitespace-pre-line text-foreground [overflow-wrap:anywhere]">{v.details}</p>}
        <Files token={token} files={v.files} />
        <p className="mt-3 text-meta text-muted-foreground">
          {v.letUsIn ? ["You can come in", v.pets ? `Pets: ${v.petsNote?.trim() || "yes"}` : "No pets"].join(" · ") : "Coordinate when I'm home"}
        </p>
        {v.additions.map((a) => (
          <div key={a.id} className="mt-4">
            <p className="text-meta text-muted-foreground">Added {day(a.on)}</p>
            {a.note && <p className="mt-1 text-body whitespace-pre-line text-foreground [overflow-wrap:anywhere]">{a.note}</p>}
            <Files token={token} files={a.files} />
          </div>
        ))}
        {v.open && <AddMore token={token} linkId={link.ctx.linkId} requestId={v.id} />}
      </section>

      {v.cancelable && <CancelRequest token={token} requestId={v.id} />}
    </main>
  );
}

/** Their photos and videos as small tiles, each opening the file. */
function Files({ token, files }: { token: string; files: ResidentFile[] }) {
  if (files.length === 0) return null;
  const r = encodeURIComponent(token);
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/api/files/resident/${f.id}?r=${r}`} target="_blank" rel="noopener noreferrer" aria-label={f.kind === "video" ? "Open video" : "Open photo"} className="relative block size-16 overflow-hidden rounded-lg bg-muted">
            {f.hasThumb && (
              // A private thumbnail behind the resident's link: next/image can't fetch it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/resident/${f.id}?v=${f.kind === "video" ? "poster" : "thumb"}&r=${r}`} alt="" className="size-full object-cover" />
            )}
            {f.kind === "video" && (
              <span className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-sm bg-scrim">
                <Play aria-hidden="true" className="size-3 fill-current text-foreground" />
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
