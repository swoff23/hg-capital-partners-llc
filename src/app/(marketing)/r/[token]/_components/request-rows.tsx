import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import type { RequestRow } from "@/lib/residents/requests";
import { STEP_LABEL } from "./step-label";

const dayOf = (d: string | null) => (d ? fmtDay(d, { weekday: d >= todayYmdEastern(), year: "auto" }) : null);

/** The home's Open or Done list: each request's words, then its step and day ("Scheduled · Tue, Nov 25"). */
export function RequestRows({ token, title, rows }: { token: string; title: string; rows: RequestRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-label text-muted-foreground">{title}</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/r/${token}/${r.id}`}
              className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors pointer-fine:hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-foreground">{r.whatsWrong}</span>
                <span className="block truncate text-meta text-muted-foreground">{[STEP_LABEL[r.step], dayOf(r.day)].filter(Boolean).join(" · ")}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
