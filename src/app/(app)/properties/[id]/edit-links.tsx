"use client";
import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import type { PropertyLink } from "@/lib/property-types";
import { updatePropertyLinks } from "../actions";
import { SectionCard } from "./edit-details";

/** Documents / links for a property — renders + edits `Property.links` JSON. */
export function PropertyDocumentsSection({
  id,
  links: initial,
}: {
  id: string;
  links: PropertyLink[];
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<PropertyLink[]>(initial);
  const [pending, start] = useTransition();

  const setRow = (i: number, patch: Partial<PropertyLink>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function save() {
    start(async () => {
      await updatePropertyLinks(id, rows);
      setEditing(false);
    });
  }
  function cancel() {
    setRows(initial);
    setEditing(false);
  }

  if (!editing) {
    return (
      <SectionCard title="Documents" onEdit={() => setEditing(true)}>
        {initial.length === 0 ? (
          <p className="text-sm text-muted">No documents or links yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {initial.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.url}
                  className="min-w-0 flex-1 truncate text-primary hover:underline"
                >
                  {l.label || l.url}
                </a>
                <span className="shrink-0 text-xs text-muted" aria-hidden>
                  ↗
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Documents"
      editing
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={cancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="w-28 shrink-0"
              placeholder="Label"
              value={row.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
            />
            <Input
              className="min-w-0 flex-1"
              placeholder="https://…"
              value={row.url}
              onChange={(e) => setRow(i, { url: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              className="shrink-0 text-xs text-red-500 hover:underline"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { label: "", url: "" }])}
          className="text-xs font-medium text-primary hover:underline"
        >
          + Add link
        </button>
      </div>
    </SectionCard>
  );
}
