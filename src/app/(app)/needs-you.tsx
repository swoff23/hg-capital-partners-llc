"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, FileBadge, FileClock, HandCoins, Hammer, Landmark, ListChecks, Receipt, RefreshCw, ShieldCheck, Send, Unplug, UserPlus, type LucideIcon } from "lucide-react";
import { Money } from "@/components/money";
import { useToast } from "@/components/toast";
import { Button, Section, chromeIconClass } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { PHONE_ROWS, moreCount, type NeedsYouItem, type NeedsYouKind } from "@/lib/home/needs-you";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";
import {
  archiveSignupAction,
  keepSignupAction,
  markBaselaneSentAction,
  undoArchiveSignupAction,
  undoKeepSignupAction,
} from "./(home)/onboarding-actions";

/** The lucide icon of the thing (docs/brand-guidelines.md, section 9). */
const ICON: Record<NeedsYouKind, LucideIcon> = {
  loan: Landmark,
  insurance: ShieldCheck,
  registration: FileBadge,
  lease: FileClock,
  missing: ListChecks,
  capex: Hammer,
  "sync-stale": RefreshCw,
  "sync-lost": Unplug,
  signup: UserPlus,
  baselane: Send,
  draw: HandCoins,
  invoice: Receipt,
};

/**
 * Home's Needs you list (docs/home-as-today.md): one row per item, each
 * opening its record. Wide rows set the thing's icon and one word in a fixed
 * column, then the title over the place, then the date. Below 480px a row
 * keeps two lines: the word leads the subline and the date ends it. On a
 * phone the list shows three rows, then "N more". A row for a new contractor
 * (sign-up, Baselane link) carries its buttons on the right, in the
 * chevron's place; a tap anywhere else on it opens their page.
 */
export function NeedsYou({ items, className }: { items: NeedsYouItem[]; className?: string }) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const more = moreCount(items.length);

  function showAll() {
    setAll(true);
    // The button goes away, so focus moves to the first row it showed.
    requestAnimationFrame(() => list.current?.querySelectorAll("a")[PHONE_ROWS]?.focus());
  }

  return (
    <Section title="Needs you" className={className}>
      <ul ref={list} className="@container divide-y divide-border">
        {items.map((item, i) => (
          <li key={item.key} className={cn(!all && i >= PHONE_ROWS && "max-sm:hidden")}>
            <Row item={item} />
          </li>
        ))}
      </ul>
      {/* No rule of its own: the third row's divider already sets it off. */}
      {more > 0 && !all && (
        <button
          type="button"
          onClick={showAll}
          className="flex min-h-10 w-full items-center text-left text-label text-fg-2 transition-colors hover:text-foreground pointer-coarse:min-h-12 sm:hidden"
        >
          {more} more
        </button>
      )}
    </Section>
  );
}

function Row({ item }: { item: NeedsYouItem }) {
  const Icon = ICON[item.kind];
  const date = item.dateLabel && <span className={item.late ? "text-destructive" : undefined}>{item.dateLabel}</span>;
  const acts = item.actions;

  const link = (
    <Link
      href={item.href}
      className={cn(
        // The hover fill reaches 8px past each side, rounded, as on the task rows beside it.
        "-mx-2 grid min-h-10 grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2 py-2 transition-colors hover:bg-muted pointer-coarse:min-h-12",
        acts
          ? "@min-[30rem]:grid-cols-[7rem_minmax(0,1fr)] @min-[30rem]:items-center"
          : "@min-[30rem]:grid-cols-[7rem_minmax(0,1fr)_auto_auto] @min-[30rem]:items-center",
        // Beside its buttons, the link takes what's left of the row, so the text ends before them at any width.
        acts && "min-w-0 flex-1",
      )}
    >
      {/* The mark: the thing's icon in --warn, and from 480px its one word. */}
      <span className="mt-[3px] inline-flex items-center gap-1.5 whitespace-nowrap text-meta font-medium text-warn @min-[30rem]:mt-0">
        <Icon aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0 pointer-coarse:size-4" />
        <span className="hidden @min-[30rem]:inline">{item.state}</span>
      </span>

      <span className="min-w-0">
        <span className={cn("block text-body text-foreground", acts && "truncate")}>{item.title}</span>
        <span className="flex min-w-0 text-meta text-muted-foreground">
          {/* A row with buttons keeps its second line for the detail alone; the icon already marks it. */}
          <span className={cn("shrink-0 whitespace-pre text-warn @min-[30rem]:hidden", acts && "hidden")}>{`${item.state} · `}</span>
          {/* An amount leads the subline, where nothing cuts it; a late part follows in --destructive. Under a
              360px list the detail ("across 4 properties") drops instead of truncating, and only a very
              long amount line is cut, after the amount, before the chevron. */}
          {item.amount != null && (
            <span className="min-w-0 truncate whitespace-pre">
              <Money value={item.amount} />
              {item.pastDue != null && (
                <>
                  {" · "}
                  <span className="text-destructive">
                    <Money value={item.pastDue} /> past due
                  </span>
                </>
              )}
            </span>
          )}
          <span className={cn("min-w-0 truncate whitespace-pre", item.amount != null && "@max-[22.5rem]:hidden")}>
            {item.amount != null && (item.pastDue != null ? " · " : " ")}
            {item.detail}
          </span>
          {date && <span className="shrink-0 whitespace-pre @min-[30rem]:hidden">{" · "}{date}</span>}
        </span>
      </span>

      {!acts && (
        <>
          {/* From 480px the date sits in its own column, right-aligned so the rows line up. */}
          <span className="num hidden whitespace-nowrap text-right text-meta text-fg-2 @min-[30rem]:block">{date}</span>
          <ChevronRight aria-hidden="true" className={cn(chromeIconClass, "self-center text-muted-foreground")} />
        </>
      )}
    </Link>
  );

  if (!acts || !item.contactId) return link;
  // The buttons sit beside the link rather than inside it (a button can't live in an anchor), at the row's right edge.
  return (
    <div className="flex items-center gap-3">
      {link}
      <RowButtons item={item} contactId={item.contactId} />
    </div>
  );
}

/** Keep and Archive on a sign-up, Sent on a Baselane link; each answers with a toast whose Undo puts it back. */
function RowButtons({ item, contactId }: { item: NeedsYouItem; contactId: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const name = firstName(item.title.replace(/^Send /, "")) || "Contractor";

  /** Run one action; on a refusal the toast says why and the row stays. */
  async function run(act: () => Promise<ActionResult>, done: { message: string; undo: () => Promise<ActionResult> }) {
    const res = await callAction(act);
    if (!res.ok) {
      toast({ message: res.error });
      return;
    }
    toast({
      message: done.message,
      key: `needs-you:${item.key}`,
      action: {
        label: "Undo",
        onAction: async () => {
          const back = await callAction(done.undo);
          if (!back.ok) toast({ message: back.error });
        },
      },
    });
  }

  const go = (act: () => Promise<ActionResult>, done: { message: string; undo: () => Promise<ActionResult> }) => start(() => run(act, done));

  return (
    <div className="flex shrink-0 items-center gap-2">
      {item.actions === "signup" ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => go(() => keepSignupAction(contactId), { message: `${name} kept`, undo: () => undoKeepSignupAction(contactId) })}
          >
            Keep
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => go(() => archiveSignupAction(contactId), { message: `${name} archived`, undo: () => undoArchiveSignupAction(contactId) })}
          >
            Archive
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => go(() => markBaselaneSentAction(contactId, true), { message: "Marked sent", undo: () => markBaselaneSentAction(contactId, false) })}
        >
          Sent
        </Button>
      )}
    </div>
  );
}
