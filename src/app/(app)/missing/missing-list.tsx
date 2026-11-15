"use client";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button as AriaButton } from "react-aria-components";
import { ChevronRight, CircleOff, ListPlus, MoreHorizontal, RotateCcw } from "lucide-react";
import { ActionBar, actionBarButton } from "@/components/action-bar";
import { Avatar } from "@/components/avatar";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { Button, Checkbox, LinkButton, Section, buttonClass } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { fmtDay, toYmd } from "@/lib/dates";
import { groupGaps, rowName, MAKE_TASK_MAX, type Gap, type SkippedGap } from "@/lib/missing/checks";
import type { HandedOff } from "@/lib/missing/queries";
import { openPropertyField, openPropertyUnit } from "../properties/[id]/edit-field-event";
import { answerUtilityAction, setVacantAction, skipGapAction, unskipGapAction } from "./actions";

/**
 * Missing info's rows (docs/specs/missing-info.md, section 5), on its page and
 * inside a property page's line. A row is one field on one record: tap it to
 * open that field, use its real answer (Done or NA, Mark vacant) in place, or
 * its ⋯ for Make task and Doesn't apply. On the page rows group by property
 * and contractor and can be picked for one Make task; on a property they're
 * that property's alone and open the editor right there.
 */

/** Below sm a row's answer buttons move into its ⋯ menu. */
function usePhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 639.98px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 639.98px)").matches,
    () => false,
  );
}

/** New task with these rows as its checklist; the intercepting route opens it as a sheet over the list. */
const makeTaskHref = (keys: readonly string[]) => `/tasks/new?missing=${encodeURIComponent(keys.join(","))}`;

export function MissingList({
  gaps,
  skipped,
  handed,
  variant,
  toolbar,
}: {
  gaps: Gap[];
  skipped: SkippedGap[];
  /** Rows already in an open Make task, by key. */
  handed: Record<string, HandedOff>;
  /** "page": grouped, with picking for Make task. "property": one property's rows on its page, opening fields in place. */
  variant: "page" | "property";
  /** The page's Required | Suggested switch, which Select sits beside. */
  toolbar?: ReactNode;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // Select turns the boxes on, as Mail's Select does: at rest a row is a row, never a box that reads as "done".
  const [selecting, setSelecting] = useState(false);
  // Rows that left on a tap, so the list answers at once; the server's next render agrees or brings them back.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const shown = gaps.filter((g) => !gone.has(g.key));
  const keep = (key: string, out: boolean) =>
    setGone((s) => {
      const next = new Set(s);
      if (out) next.add(key);
      else next.delete(key);
      return next;
    });
  const pickable = variant === "page" && selecting;
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const toggle = (key: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAKE_TASK_MAX) next.add(key);
      return next;
    });
  const pickedKeys = shown.filter((g) => picked.has(g.key)).map((g) => g.key);

  const rows = (list: Gap[]) => (
    <ul className="divide-y divide-border">
      {list.map((g) => (
        <GapRow
          key={g.key}
          gap={g}
          variant={variant}
          handed={handed[g.key] ?? null}
          pickable={pickable}
          picked={picked.has(g.key)}
          onPick={() => toggle(g.key)}
          onGone={(out) => keep(g.key, out)}
        />
      ))}
    </ul>
  );

  return (
    <>
      {variant === "page" && (
        <div className="mb-6 flex items-center justify-between gap-3">
          {/* Its own box: an element the page passes in sits alone, never in a list of siblings. */}
          <div className="min-w-0">{toolbar}</div>
          {/* A phone hands off one row at a time from its ⋯; picking many is for desktop and tablet (D9). */}
          {shown.length > 0 && (
            <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={selecting ? stopSelecting : () => setSelecting(true)}>
              {selecting ? "Cancel" : "Select"}
            </Button>
          )}
        </div>
      )}
      {variant === "page" ? (
        <div className="space-y-8 pointer-coarse:space-y-6">
          {groupGaps(shown).map(({ group, rows: list }) => (
            <Section
              key={`${group.kind}:${group.id}`}
              title={
                <Link href={group.href} className="pointer-fine:hover:underline pointer-fine:underline-offset-3">
                  {group.label}
                </Link>
              }
            >
              {rows(list)}
            </Section>
          ))}
        </div>
      ) : (
        rows(shown)
      )}

      {skipped.length > 0 && <SkippedFold skipped={skipped} grouped={variant === "page"} />}

      {pickable && (
        <ActionBar
          placement="app"
          contentClassName="box-content max-w-200"
          status={pickedKeys.length > 0 ? `${pickedKeys.length} selected` : "Pick rows for one task"}
          secondary={
            <Button variant="secondary" className={actionBarButton} onClick={stopSelecting}>
              Cancel
            </Button>
          }
          primary={
            pickedKeys.length > 0 ? (
              <LinkButton href={makeTaskHref(pickedKeys)} variant="primary" className={actionBarButton} onClick={stopSelecting}>
                Make task
              </LinkButton>
            ) : (
              <Button variant="primary" className={actionBarButton} onClick={() => setPicked(new Set(shown.slice(0, MAKE_TASK_MAX).map((g) => g.key)))}>
                Select all
              </Button>
            )
          }
        />
      )}
    </>
  );
}

function GapRow({
  gap: g,
  variant,
  handed,
  pickable,
  picked,
  onPick,
  onGone,
}: {
  gap: Gap;
  variant: "page" | "property";
  handed: HandedOff | null;
  pickable: boolean;
  picked: boolean;
  onPick: () => void;
  onGone: (out: boolean) => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const phone = usePhone();
  const name = rowName(g);

  /** One write; a refusal is a toast and the row comes back, a success a toast whose Undo puts it back. */
  function run<T>(act: () => Promise<ActionResult<T>>, done: (data: T) => { message: string; undo: () => Promise<ActionResult<unknown>> }) {
    onGone(true);
    start(async () => {
      const res = await callAction(act);
      if (!res.ok) {
        onGone(false);
        toast({ message: res.error });
        return;
      }
      const d = done(res.data as T);
      toast({
        message: d.message,
        key: `missing:${g.key}`,
        action: {
          label: "Undo",
          onAction: async () => {
            const back = await callAction(d.undo);
            if (!back.ok) toast({ message: back.error });
            else onGone(false);
          },
        },
      });
    });
  }

  function answerStatus(value: "Done" | "NA") {
    if (g.answer?.kind !== "status") return;
    const { propertyId, unitId, field } = g.answer;
    run(
      () => answerUtilityAction(propertyId, unitId, field, value),
      (d) => ({ message: `${name} set to ${value}`, undo: () => answerUtilityAction(propertyId, unitId, field, d.before) }),
    );
  }

  function markVacant() {
    if (g.answer?.kind !== "vacant") return;
    const { propertyId, unitId } = g.answer;
    run(
      () => setVacantAction(propertyId, unitId, true),
      () => ({ message: `${g.place ?? "Unit"} marked vacant`, undo: () => setVacantAction(propertyId, unitId, false) }),
    );
  }

  function skip() {
    run(
      () => skipGapAction(g.check, g.subject),
      (d) => ({ message: "Marked doesn't apply", undo: () => unskipGapAction(g.check, d.subject) }),
    );
  }

  // On its own property's page a row opens the editor right there instead of loading the page again.
  const inPlace = variant === "property" && (g.field !== null || g.section === "units");
  const open = () => (g.field ? openPropertyField(g.field) : g.unitId && openPropertyUnit(g.unitId));
  const openerClass = "-mx-2 flex min-h-10 min-w-0 flex-1 flex-col justify-center rounded-md px-2 py-1 text-left transition-colors pointer-fine:hover:bg-muted pointer-coarse:min-h-12";
  const words = (
    <>
      <span className="block truncate text-body text-foreground">
        {g.place && <span className="max-sm:hidden">{g.place} · </span>}
        {g.label}
        {g.note && <span className="text-muted-foreground max-sm:hidden"> · {g.note}</span>}
      </span>
      {(g.place || g.note) && (
        <span className="block truncate text-meta text-muted-foreground sm:hidden">{[g.place, g.note].filter(Boolean).join(" · ")}</span>
      )}
    </>
  );

  const answers: { label: string; act?: () => void; href?: string }[] =
    g.answer?.kind === "status"
      ? [
          { label: "Done", act: () => answerStatus("Done") },
          { label: "NA", act: () => answerStatus("NA") },
        ]
      : g.answer?.kind === "vacant"
        ? [{ label: "Mark vacant", act: markVacant }]
        : g.answer?.kind === "open"
          ? [inPlace ? { label: g.answer.verb, act: open } : { label: g.answer.verb, href: g.href }]
          : [];

  return (
    <li className="group/row flex items-center gap-3 py-1" aria-busy={pending || undefined}>
      {pickable && <Checkbox aria-label={`Select ${name}`} checked={picked} onChange={onPick} large={false} className="pointer-coarse:size-5" />}

      {pickable ? (
        // While selecting, a tap anywhere on the row picks it, as in Mail; the row opens again after Cancel.
        <button type="button" onClick={onPick} aria-pressed={picked} className={openerClass}>
          {words}
        </button>
      ) : inPlace ? (
        <button type="button" onClick={open} className={openerClass}>
          {words}
        </button>
      ) : (
        <Link href={g.href} className={openerClass}>
          {words}
        </Link>
      )}

      {answers.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 max-sm:hidden">
          {answers.map((a) =>
            a.href ? (
              <LinkButton key={a.label} href={a.href} size="sm">
                {a.label}
              </LinkButton>
            ) : (
              <Button key={a.label} size="sm" variant="secondary" disabled={pending} onClick={a.act}>
                {a.label}
              </Button>
            ),
          )}
        </div>
      )}

      {handed && (
        <Link href={`/tasks/${handed.taskId}`} aria-label={handed.who ? `In ${handed.who}'s task` : "In a task"} className="shrink-0">
          <Avatar name={handed.who ?? "Task"} size={20} />
        </Link>
      )}

      <MenuTrigger>
        <AriaButton aria-label={`${name} actions`} className={buttonClass({ variant: "ghost", size: "sm", icon: true })}>
          <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        </AriaButton>
        <Menu sheetTitle={name}>
          {phone &&
            answers.map((a) =>
              a.href ? (
                <MenuItem key={a.label} href={a.href} icon={<ChevronRight />}>
                  {a.label}
                </MenuItem>
              ) : (
                <MenuItem key={a.label} onAction={a.act} icon={<ChevronRight />}>
                  {a.label}
                </MenuItem>
              ),
            )}
          {!handed && (
            <MenuItem href={makeTaskHref([g.key])} icon={<ListPlus />}>
              Make task
            </MenuItem>
          )}
          <MenuItem onAction={skip} icon={<CircleOff />}>
            Doesn&apos;t apply
          </MenuItem>
        </Menu>
      </MenuTrigger>
    </li>
  );
}

/** The rows marked Doesn't apply, folded at the foot: who and when, and a way to put each back. */
function SkippedFold({ skipped, grouped }: { skipped: SkippedGap[]; grouped: boolean }) {
  const count = `${skipped.length} marked doesn't apply`;
  return (
    <details className="group/fold mt-6">
      <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 text-label text-fg-2 transition-colors hover:text-foreground pointer-coarse:min-h-12 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-fast group-open/fold:rotate-90 motion-reduce:transition-none" />
        {count}
      </summary>
      <ul className="divide-y divide-border">
        {skipped.map((g) => (
          <SkippedRow key={g.key} gap={g} grouped={grouped} />
        ))}
      </ul>
    </details>
  );
}

function SkippedRow({ gap: g, grouped }: { gap: SkippedGap; grouped: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const when = fmtDay(toYmd(g.skippedAt), { year: "auto" });
  const name = rowName(g);
  const who: ReactNode = [g.skippedBy, when].filter(Boolean).join(" · ");

  function putBack() {
    start(async () => {
      const res = await callAction(() => unskipGapAction(g.check, g.subject));
      if (!res.ok) toast({ message: res.error });
      else {
        toast({ message: `${name} is back on the list` });
        router.refresh();
      }
    });
  }

  return (
    <li className="flex items-center gap-3 py-1" aria-busy={pending || undefined}>
      <Link href={g.href} className="-mx-2 flex min-h-10 min-w-0 flex-1 flex-col justify-center rounded-md px-2 py-1 transition-colors pointer-fine:hover:bg-muted pointer-coarse:min-h-12">
        <span className="block truncate text-body text-fg-2">
          {grouped && `${g.group.label} · `}
          {name}
        </span>
        <span className="block truncate text-meta text-muted-foreground">{who}</span>
      </Link>
      <MenuTrigger>
        <AriaButton aria-label={`${name} actions`} className={buttonClass({ variant: "ghost", size: "sm", icon: true })}>
          <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        </AriaButton>
        <Menu sheetTitle={name}>
          <MenuItem onAction={putBack} icon={<RotateCcw />}>
            Put back on the list
          </MenuItem>
        </Menu>
      </MenuTrigger>
    </li>
  );
}
