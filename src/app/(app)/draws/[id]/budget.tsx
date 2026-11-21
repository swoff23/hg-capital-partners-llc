"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { DatePicker } from "@/components/due-date-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Money } from "@/components/money";
import { NumberInput } from "@/components/number-input";
import { useRun } from "@/components/use-run";
import { FormSheet } from "@/components/form-sheet";
import { AddRow, Button, FormField, Section, Table, Td, Th } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import type { DrawIn, LineFigures, UnitGroup } from "@/lib/draws/figures";
import type { UnitOption } from "@/lib/draws/queries";
import { parseAmount } from "@/lib/money";
import { deleteDrawAction, sendDraftAction, setDraftAmountAction, startDraftAction, unsendDrawAction } from "../actions";
import { fmtCents, optionalAmountText } from "../format";
import { DraftSheet } from "./draft-sheet";
import { LineSheet } from "./line-sheet";
import { WorksheetUpload } from "./worksheet-upload";

/** The sheet on screen: a phone's draw-amount sheet, a line to edit, or a new line (with the unit it starts in). */
type Open = { line: LineFigures; quick: boolean } | { add: true; unit: string };

/** The draw being built: its id and number. */
export type Draft = { id: string; number: number };

/** Below sm a tap on a line opens the draw-amount sheet (while a draw is being built); from sm the full Line sheet. */
const onPhone = () => !window.matchMedia("(min-width: 640px)").matches;

/** What's available on a line, below zero when its budget was cut under what's drawn. */
const over = (line: LineFigures) => Math.max(0, -line.available);

/**
 * The Budget section (docs/specs/rehab-draws.md, L2), in two modes. Day to day: Line, Budget, Funded, Submitted (only
 * while some line has any) and Available, with New draw in the header. While a draw is being built: one more
 * column, "Draw N", with an input per line that saves as you leave it, and a footer with the draw's total, Cancel and
 * Send to lender. A row opens the Line sheet; on a phone, while a draw is being built, a small sheet for the line's
 * amount first. A rehab marked done is read-only.
 */
export function BudgetSection({
  rehabId,
  holdback,
  units,
  groups,
  draws,
  draft,
  ready,
  lender,
  today,
  done,
}: {
  rehabId: string;
  /** The holdback as entered, or null; the worksheet upload compares its own with it. */
  holdback: number | null;
  units: UnitOption[];
  groups: UnitGroup[];
  draws: DrawIn[];
  /** The rehab's lender, named in Send to lender's confirm. */
  lender: string | null;
  /** The draw being built, or null day to day. */
  draft: Draft | null;
  /** The draft's total. */
  ready: number;
  today: Ymd;
  done: boolean;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const start = useRun();
  const hasLines = groups.some((g) => g.lines.length > 0);
  const split = groups.some((g) => g.unitLabel);
  const submitted = groups.some((g) => g.lines.some((l) => l.atLender > 0));
  // A new line starts in the last group's unit.
  const lastUnitId = groups.length ? groups[groups.length - 1].unitId : null;
  const lastUnit = units.find((u) => u.unitId === lastUnitId)?.value ?? "";
  const openLine = (line: LineFigures) => setOpen({ line, quick: draft != null && onPhone() });
  const building = draft != null && !done;

  return (
    <Section
      title="Budget"
      actions={
        hasLines && !done && !draft ? (
          <Button variant="secondary" size="sm" pending={start.pending} onClick={() => start.run(() => startDraftAction(rehabId))}>
            New draw
          </Button>
        ) : undefined
      }
    >
      {!hasLines ? (
        done ? (
          <p className="py-3 text-meta text-muted-foreground">No budget lines.</p>
        ) : (
          <WorksheetUpload rehabId={rehabId} holdback={holdback} units={units} onAdd={() => setOpen({ add: true, unit: "" })} />
        )
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th numeric className="max-sm:hidden">
                Budget
              </Th>
              <Th numeric className="max-lg:hidden">
                Funded
              </Th>
              {submitted && (
                <Th numeric className="max-lg:hidden">
                  Submitted
                </Th>
              )}
              {building && (
                <Th numeric className="max-sm:hidden">
                  Draw {draft.number}
                </Th>
              )}
              <Th numeric>Available</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g) => (
              <GroupRows
                key={g.unitId ?? g.unitLabel ?? ""}
                group={g}
                split={split}
                done={done}
                submitted={submitted}
                draft={building ? draft : null}
                onOpen={openLine}
              />
            ))}
          </tbody>
        </Table>
      )}
      {hasLines && !done && <AddRow onClick={() => setOpen({ add: true, unit: lastUnit })}>Add a line</AddRow>}
      {hasLines && building && <DrawFooter rehabId={rehabId} draft={draft} total={ready} lender={lender} today={today} />}

      {open && "add" in open && (
        <LineSheet rehabId={rehabId} units={units} draws={draws} line={null} unit={open.unit} isOpen onOpenChange={(o) => !o && setOpen(null)} />
      )}
      {open && "line" in open && open.quick && draft && (
        <DraftSheet
          key={`quick:${open.line.id}`}
          drawNumber={draft.number}
          line={open.line}
          isOpen
          onOpenChange={(o) => !o && setOpen(null)}
          onEditLine={() => setOpen({ line: open.line, quick: false })}
        />
      )}
      {open && "line" in open && !open.quick && (
        <LineSheet
          key={open.line.id}
          rehabId={rehabId}
          units={units}
          draws={draws}
          line={open.line}
          isOpen
          onOpenChange={(o) => !o && setOpen(null)}
        />
      )}
    </Section>
  );
}

function GroupRows({
  group,
  split,
  done,
  submitted,
  draft,
  onOpen,
}: {
  group: UnitGroup;
  split: boolean;
  done: boolean;
  submitted: boolean;
  draft: Draft | null;
  onOpen: (line: LineFigures) => void;
}) {
  return (
    <>
      {split && group.unitLabel && (
        <tr className="bg-canvas">
          <Td className="font-semibold text-foreground">{group.unitLabel}</Td>
          <Td numeric className="font-semibold max-sm:hidden">
            <Money value={group.revised} />
          </Td>
          <Td className="max-lg:hidden" />
          {submitted && <Td className="max-lg:hidden" />}
          {draft && <Td className="max-sm:hidden" />}
          <Td numeric className="font-semibold">
            <Money value={Math.round(group.lines.reduce((s, l) => s + Math.round(l.available * 100), 0)) / 100} />
          </Td>
        </tr>
      )}
      {group.lines.map((l) => (
        <LineRow key={l.id} line={l} split={split} done={done} submitted={submitted} draft={draft} onOpen={() => onOpen(l)} />
      ))}
    </>
  );
}

function LineRow({
  line,
  split,
  done,
  submitted,
  draft,
  onOpen,
}: {
  line: LineFigures;
  split: boolean;
  done: boolean;
  submitted: boolean;
  draft: Draft | null;
  onOpen: () => void;
}) {
  return (
    <tr
      // The whole row opens the line, as a Portfolio row opens its property; the draw's input keeps its own clicks.
      onClick={done ? undefined : (e) => !(e.target as HTMLElement).closest("input") && onOpen()}
      className={done ? undefined : "transition-colors duration-fast pointer-fine:cursor-pointer hover:bg-muted"}
    >
      <Td className="w-full max-w-0 p-0 align-middle">
        {done ? (
          <span className="flex min-h-10 min-w-0 items-center px-3 py-2 pointer-coarse:min-h-12">
            <span className="min-w-0 truncate text-body text-foreground">{line.name}</span>
          </span>
        ) : (
          <button
            type="button"
            aria-haspopup="dialog"
            className="flex min-h-10 w-full min-w-0 items-center px-3 py-2 text-left pointer-coarse:min-h-12"
          >
            <span className="min-w-0 truncate text-body text-foreground">{line.name}</span>
          </button>
        )}
      </Td>
      <Td numeric className="align-middle max-sm:hidden">
        <Money value={line.revised} />
      </Td>
      <Td numeric className="align-middle max-lg:hidden">
        <Money value={line.funded} />
      </Td>
      {submitted && (
        <Td numeric className="align-middle max-lg:hidden">
          <Money value={line.atLender} />
        </Td>
      )}
      {draft && (
        <Td numeric className="align-middle max-sm:hidden">
          <span className="max-lg:hidden">
            {/* Remounts with the saved figure, so what shows is what the page now holds. */}
            <DraftInput key={`${line.id}:${line.draft}`} line={line} draft={draft} name={`${split && line.unitLabel ? `${line.unitLabel} · ` : ""}${line.name}`} />
          </span>
          <span className="lg:hidden">{line.draft > 0 ? <Money value={line.draft} /> : <span className="text-muted-foreground">—</span>}</span>
        </Td>
      )}
      <Td numeric className="align-middle">
        <Available line={line} draft={draft} />
      </Td>
    </tr>
  );
}

/**
 * What's available on a line; below zero "Over by $X" in --destructive, on this figure only. On a phone, while a draw
 * is being built, a line with an amount in that draw shows it, labelled, since the column for it is hidden there.
 */
function Available({ line, draft }: { line: LineFigures; draft: Draft | null }) {
  const figure =
    line.available < 0 ? (
      <span className="whitespace-nowrap text-destructive">
        Over by <Money value={over(line)} />
      </span>
    ) : (
      <Money value={line.available} />
    );
  if (!draft || line.draft <= 0) return figure;
  return (
    <>
      <span className="flex flex-col items-end sm:hidden">
        <Money value={line.draft} />
        <span className="text-meta text-muted-foreground">Draw {draft.number}</span>
      </span>
      <span className="max-sm:hidden">{figure}</span>
    </>
  );
}

function DraftInput({ line, draft, name }: { line: LineFigures; draft: Draft; name: string }) {
  const start = optionalAmountText(line.draft);
  const [text, setText] = useState(start);
  const run = useRun();
  // Esc puts the old figure back; the blur that follows must neither save nor tidy what was typed.
  const cancelled = useRef(false);

  function save() {
    if (cancelled.current) return;
    const typed = parseAmount(text);
    if (text.trim() === "" ? !line.draft : typed != null && typed === line.draft) return;
    run.run(() => setDraftAmountAction(line.id, text), { failed: () => setText(start) });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      cancelled.current = true;
      setText(start);
      e.currentTarget.blur();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-draft-input] input"));
    const at = inputs.indexOf(e.currentTarget);
    if (inputs[at + 1]) inputs[at + 1].focus();
    else e.currentTarget.blur();
  }

  return (
    <span data-draft-input="" className="block">
      <NumberInput
        kind="money"
        size="sm"
        align="end"
        aria-label={`Draw ${draft.number} for ${name}`}
        className="w-32"
        value={text}
        onChange={(next) => {
          if (!cancelled.current) setText(next);
        }}
        onFocus={() => {
          cancelled.current = false;
        }}
        onBlur={save}
        onKeyDown={onKeyDown}
        enterKeyHint="next"
      />
    </span>
  );
}

/**
 * Under the table while a draw is being built: its total, Cancel and Send to lender together at the bottom right, as
 * QuickBooks' invoice and Airwallex's payment pages set their actions (Mobbin). Send opens a short confirm with the
 * amount, the lender and the day it went (today unless changed), the way Mercury's and Melio's reviews ask before
 * money moves. Cancel asks first once the draw has amounts. Send toasts what was recorded, with Undo.
 */
function DrawFooter({ rehabId, draft, total, lender, today }: { rehabId: string; draft: Draft; total: number; lender: string | null; today: Ymd }) {
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);
  const cancel = useRun();

  function cancelIt() {
    cancel.run(() => deleteDrawAction(draft.id), {
      succeeded: () => setAsking(false),
      failed: () => setAsking(false),
      done: `Draw ${draft.number} cancelled`,
      key: `rehab:${rehabId}:send`,
    });
  }

  return (
    <div className="flex flex-col items-end gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end">
      <span className="min-w-0 truncate text-body text-foreground">
        Draw {draft.number} · <Money value={total} />
      </span>
      <div className="flex items-center gap-3">
        <Button variant="secondary" pending={cancel.pending} onClick={() => (total > 0 ? setAsking(true) : cancelIt())}>
          Cancel
        </Button>
        <Button variant="primary" disabled={total <= 0} onClick={() => setConfirming(true)}>
          Send to lender
        </Button>
      </div>
      {confirming && <SendSheet rehabId={rehabId} draft={draft} total={total} lender={lender} today={today} onOpenChange={setConfirming} />}
      {asking && (
        <ConfirmDialog
          title={`Cancel draw ${draft.number}?`}
          body="Its amounts are cleared."
          onClose={() => !cancel.pending && setAsking(false)}
          cancelLabel="Keep it"
          busy={cancel.pending}
          actions={
            <Button variant="destructive" size="sm" disabled={cancel.pending} onClick={cancelIt}>
              Cancel draw
            </Button>
          }
        />
      )}
    </div>
  );
}

/** Send to lender's confirm: the draw's amount and lender, and the day it was sent. */
function SendSheet({
  rehabId,
  draft,
  total,
  lender,
  today,
  onOpenChange,
}: {
  rehabId: string;
  draft: Draft;
  total: number;
  lender: string | null;
  today: Ymd;
  onOpenChange: (open: boolean) => void;
}) {
  const [day, setDay] = useState<Ymd>(today);
  const send = useRun();

  function submit() {
    send.run(() => sendDraftAction(rehabId, day), {
      failure: "inline",
      succeeded: (data) => {
        onOpenChange(false);
        send.toast({
          message: `Draw ${draft.number} sent · ${fmtCents(data.sentAmount)}`,
          key: `rehab:${rehabId}:send`,
          action: {
            label: "Undo",
            onAction: async () => {
              const r = await callAction(() => unsendDrawAction(data.drawId));
              if (!r.ok) send.toast({ message: r.error });
            },
          },
        });
      },
    });
  }

  return (
    <FormSheet
      title={`Send draw ${draft.number}`}
      isOpen
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Send"
      pending={send.pending}
      values={day}
      discardTitle="Close without sending?"
      leaveTitle="Leave without sending?"
      error={send.error}
      fieldErrors={send.fieldErrors}
    >
      <p className="text-body text-foreground">
        <Money value={total} />
        {lender ? ` to ${lender}` : ""}
      </p>
      <FormField label="Sent on" error={send.fieldErrors?.sentOn}>
        {() => <DatePicker variant="field" label="Sent on" today={today} allowNone={false} value={day} onChange={(v) => setDay(v ?? today)} />}
      </FormField>
    </FormSheet>
  );
}
