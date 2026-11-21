"use client";
import { useRef, useState, type DragEvent } from "react";
import { Money } from "@/components/money";
import { Select } from "@/components/select";
import { useRun } from "@/components/use-run";
import { Button, SaveError } from "@/components/ui";
import { linesTotal } from "@/lib/draws/figures";
import type { UnitOption } from "@/lib/draws/queries";
import type { WorksheetRead } from "@/lib/draws/worksheet";
import { cn } from "@/lib/utils";
import { importWorksheetAction, readWorksheetAction } from "../actions";

const MAX_BYTES = 1024 * 1024;
const TOO_BIG = "That file is over 1 MB. Upload the worksheet Vontive sent.";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * An empty Budget (docs/specs/rehab-draws.md, L4): upload Vontive's Renovation Draw Worksheet (.xlsx) or add a line.
 * The file is read first and what it holds is shown, so nothing comes in until Add to rehab. It takes a drop on a
 * laptop and opens Files on a phone. A refusal from the reader shows under the buttons.
 */
export function WorksheetUpload({ rehabId, units, onAdd }: { rehabId: string; units: UnitOption[]; onAdd: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<WorksheetRead | null>(null);
  const [over, setOver] = useState(false);
  const [tooBig, setTooBig] = useState(false);
  // Each worksheet unit's pick: the rehab's units in order, then nothing (it keeps the worksheet's own words).
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const reading = useRun();
  const adding = useRun();

  function read(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setTooBig(true);
      return;
    }
    setTooBig(false);
    const form = new FormData();
    form.set("file", file);
    reading.run(() => readWorksheetAction(form), {
      failure: "inline",
      succeeded: (read) => {
        setPicks(Object.fromEntries(read.units.map((u, i) => [u, units[i]?.value ?? null])));
        setFound(read);
      },
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    read(e.dataTransfer.files[0]);
  }

  function add() {
    if (!found) return;
    adding.run(() => importWorksheetAction(rehabId, found, picks), {
      failure: "inline",
      done: "Worksheet added",
      key: `rehab:${rehabId}:worksheet`,
    });
  }

  const input$ = (
    <input
      ref={input}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        read(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (found) {
    const pastTotal = linesTotal(found.draws.flatMap((d) => d.amounts.map((amount) => ({ amount }))));
    return (
      <div className="space-y-3 py-4">
        <ul className="space-y-1 text-body text-fg-2">
          {found.units.length > 0 && units.length === 0 && <li>{found.units.join(", ")}</li>}
          <li>{plural(found.lines.length, "line", "lines")}</li>
          {found.holdback != null && (
            <li>
              Holdback <Money value={found.holdback} />
            </li>
          )}
          {found.draws.length > 0 && (
            <li>
              {plural(found.draws.length, "past draw", "past draws")}, <Money value={pastTotal} /> in all
            </li>
          )}
        </ul>
        {found.units.length > 0 && units.length > 0 && (
          <div className="space-y-3">
            {found.units.map((u) => (
              <Select
                key={u}
                label={`${u} is`}
                emptyLabel={`Keep as ${u}`}
                items={units.map((o) => ({ id: o.value, label: o.label }))}
                value={picks[u] ?? null}
                onChange={(v) => setPicks((p) => ({ ...p, [u]: v }))}
              />
            ))}
          </div>
        )}
        {found.draws.length > 0 && <p className="text-meta text-muted-foreground">Past draws come in as Funded, without dates.</p>}
        <div className="flex items-center gap-2">
          <Button variant="primary" pending={adding.pending} onClick={add}>
            Add to rehab
          </Button>
          <Button variant="secondary" disabled={adding.pending} onClick={() => setFound(null)}>
            Cancel
          </Button>
        </div>
        {adding.error && <SaveError>{adding.error}</SaveError>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("flex flex-col items-center gap-3 rounded-lg px-4 py-8 text-center", over && "ring-1 ring-inset ring-primary")}
    >
      {input$}
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <Button variant="primary" pending={reading.pending} onClick={() => input.current?.click()}>
          Upload Vontive&apos;s worksheet
        </Button>
        <Button variant="secondary" disabled={reading.pending} onClick={onAdd}>
          Add a line
        </Button>
      </div>
      {(tooBig || reading.fieldErrors?.file || reading.error) && <SaveError>{tooBig ? TOO_BIG : (reading.fieldErrors?.file ?? reading.error)}</SaveError>}
    </div>
  );
}
