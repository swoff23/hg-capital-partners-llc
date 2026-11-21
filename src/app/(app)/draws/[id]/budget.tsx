"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { DatePicker } from "@/components/due-date-picker";
import { Money } from "@/components/money";
import { NumberInput } from "@/components/number-input";
import { useRun } from "@/components/use-run";
import { AddRow, Button, Section, Table, Td, Th } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import type { LineFigures, UnitGroup } from "@/lib/draws/figures";
import type { UnitOption } from "@/lib/draws/queries";
import { parseAmount } from "@/lib/money";
import { sendDraftAction, setDraftAmountAction, unsendDrawAction } from "../actions";
import { fmtCents, optionalAmountText } from "../format";
import { DraftSheet } from "./draft-sheet";
import { LineSheet } from "./line-sheet";
import { WorksheetUpload } from "./worksheet-upload";

/** The sheet on screen: a phone's draft sheet, a line to edit, or a new line (with the unit it starts in). */
type Open = { line: LineFigures; quick: boolean } | { add: true; unit: string };

/** Below sm a tap on a line opens the draft sheet; from sm the full Line sheet. */
const onPhone = () => !window.matchMedia("(min-width: 640px)").matches;

/**
 * The Budget section (docs/specs/rehab-draws.md, L2): a row per line, grouped under a heading row per unit when the
 * lender splits the budget. From lg the Draft cell is an input that saves as you leave it; the line's name opens the
 * Line sheet, and on a phone a small sheet for the draft first. A line past its budget says "Over by $X" on its Left
 * figure only. Mark sent sits under the table once the draft has a total. A rehab marked done is read-only.
 */
export function BudgetSection({
  rehabId,
  units,
  groups,
  ready,
  draftNumber,
  today,
  done,
}: {
  rehabId: string;
  units: UnitOption[];
  groups: UnitGroup[];
  /** The draft's total. */
  ready: number;
  /** The draft's number, for Mark sent's toast. */
  draftNumber: number | null;
  today: Ymd;
  done: boolean;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const hasLines = groups.some((g) => g.lines.length > 0);
  const split = groups.some((g) => g.unitLabel);
  // The Submitted column (money on draws sent and not yet funded) shows only while some line has some
  // (Connor, Nov 20: "only need to show that column if there is anything at the lender").
  const lender = groups.some((g) => g.lines.some((l) => l.atLender !== 0));
  // A new line starts in the last group's unit.
  const lastUnitId = groups.length ? groups[groups.length - 1].unitId : null;
  const lastUnit = units.find((u) => u.unitId === lastUnitId)?.value ?? "";
  const openLine = (line: LineFigures) => setOpen({ line, quick: onPhone() });

  return (
    <Section title="Budget">
      {!hasLines ? (
        done ? (
          <p className="py-3 text-meta text-muted-foreground">No budget lines.</p>
        ) : (
          <WorksheetUpload rehabId={rehabId} units={units} onAdd={() => setOpen({ add: true, unit: "" })} />
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
              {lender && (
                <Th numeric className="max-lg:hidden">
                  Submitted
                </Th>
              )}
              <Th numeric>
                Draft
              </Th>
              <Th numeric className="max-sm:hidden">
                Left
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g) => (
              <GroupRows key={g.unitId ?? g.unitLabel ?? ""} group={g} split={split} lender={lender} done={done} onOpen={openLine} />
            ))}
          </tbody>
        </Table>
      )}
      {hasLines && !done && <AddRow onClick={() => setOpen({ add: true, unit: lastUnit })}>Add a line</AddRow>}
      {hasLines && !done && ready > 0 && draftNumber != null && <MarkSent rehabId={rehabId} number={draftNumber} total={ready} today={today} />}

      {open && "add" in open && (
        <LineSheet rehabId={rehabId} units={units} line={null} unit={open.unit} isOpen onOpenChange={(o) => !o && setOpen(null)} />
      )}
      {open && "line" in open && open.quick && (
        <DraftSheet
          key={`quick:${open.line.id}`}
          line={open.line}
          isOpen
          onOpenChange={(o) => !o && setOpen(null)}
          onEditLine={() => setOpen({ line: open.line, quick: false })}
        />
      )}
      {open && "line" in open && !open.quick && (
        <LineSheet key={open.line.id} rehabId={rehabId} units={units} line={open.line} isOpen onOpenChange={(o) => !o && setOpen(null)} />
      )}
    </Section>
  );
}

function GroupRows({
  group,
  split,
  lender,
  done,
  onOpen,
}: {
  group: UnitGroup;
  split: boolean;
  lender: boolean;
  done: boolean;
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
          {lender && <Td className="max-lg:hidden" />}
          <Td />
          <Td numeric className="font-semibold max-sm:hidden">
            <Money value={group.left} />
          </Td>
        </tr>
      )}
      {group.lines.map((l) => (
        <LineRow key={l.id} line={l} split={split} lender={lender} done={done} onOpen={() => onOpen(l)} />
      ))}
    </>
  );
}

function LineRow({ line, split, lender, done, onOpen }: { line: LineFigures; split: boolean; lender: boolean; done: boolean; onOpen: () => void }) {
  return (
    <tr
      // The whole row opens the line, as a Portfolio row opens its property; the draft input keeps its own clicks.
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
      {/* What's on draws sent and not yet funded (Connor, Nov 20, option B), so Budget less these columns reads as Left. */}
      {lender && (
        <Td numeric className="align-middle max-lg:hidden">
          <Money value={line.atLender} />
        </Td>
      )}
      <Td numeric className="align-middle">
        <DraftCell line={line} split={split} done={done} />
      </Td>
      <Td numeric className="align-middle max-sm:hidden">
        <Left line={line} />
      </Td>
    </tr>
  );
}

/** What's left on a line; past zero it's "Over by $X" in --destructive, on this figure only. */
function Left({ line }: { line: LineFigures }) {
  if (line.left < 0) {
    return (
      <span className="whitespace-nowrap text-destructive">
        Over by <Money value={line.over} />
      </span>
    );
  }
  return <Money value={line.left} />;
}

/** The phone's figure: the draft, or what's left when there's none. */
function PhoneFigure({ line }: { line: LineFigures }) {
  if (line.draft > 0) return <Money value={line.draft} />;
  if (line.left < 0) {
    return (
      <span className="whitespace-nowrap text-destructive">
        Over by <Money value={line.over} />
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-muted-foreground">
      <Money value={line.left} /> left
    </span>
  );
}

/**
 * The draft's figure on a line. From lg an input that saves on Enter or leaving it (blank clears, Esc puts the old
 * figure back) and moves down a row on Enter; at tablet width the figure; on a phone the draft, or what's left when
 * there's none, which opens the draft sheet. A rehab marked done shows the figure only.
 */
function DraftCell({ line, split, done }: { line: LineFigures; split: boolean; done: boolean }) {
  const figure = line.draft > 0 ? <Money value={line.draft} /> : <span className="text-muted-foreground">—</span>;
  const name = `${split && line.unitLabel ? `${line.unitLabel} · ` : ""}${line.name}`;
  return (
    <>
      {done ? (
        figure
      ) : (
        <span className="max-lg:hidden">
          {/* Remounts with the saved figure, so what shows is what the page now holds. */}
          <DraftInput key={`${line.id}:${line.draft}`} line={line} name={name} />
        </span>
      )}
      {!done && <span className="max-sm:hidden lg:hidden">{figure}</span>}
      {done ? null : (
        <button type="button" aria-haspopup="dialog" className="-my-2 min-h-12 py-2 text-right sm:hidden">
          <span className="sr-only">Draft for {name}: </span>
          <PhoneFigure line={line} />
        </button>
      )}
    </>
  );
}

function DraftInput({ line, name }: { line: LineFigures; name: string }) {
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
        aria-label={`Draft for ${name}`}
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

/** Mark sent: the day (today unless picked) and the draft's total go to the lender; Undo takes it back to a draft. */
function MarkSent({ rehabId, number, total, today }: { rehabId: string; number: number; total: number; today: Ymd }) {
  const [day, setDay] = useState<Ymd>(today);
  const run = useRun();

  function send() {
    run.run(() => sendDraftAction(rehabId, day), {
      succeeded: (data) => {
        // What the server recorded as sent, not the total on screen when the button was pressed.
        const sent = (data as { sentAmount?: number }).sentAmount ?? total;
        run.toast({
          message: `Draw ${number} sent · ${fmtCents(sent)}`,
          key: `rehab:${rehabId}:send`,
          action: {
            label: "Undo",
            onAction: async () => {
              const r = await callAction(() => unsendDrawAction(data.drawId));
              if (!r.ok) run.toast({ message: r.error });
            },
          },
        });
      },
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <DatePicker variant="chip" label="Sent on" prefix={<span>Sent</span>} today={today} allowNone={false} value={day} onChange={(v) => setDay(v ?? today)} />
      <Button variant="primary" pending={run.pending} onClick={send}>
        Mark sent
      </Button>
    </div>
  );
}
