"use client";
import { useId, useState } from "react";
import { CHECKLIST_FULL, CHECKLIST_ITEM_MAX, NEW_CHECKLIST_MAX } from "@/lib/tasks/limits";
import { AddChecklistItem, ChecklistItemRow, InertBox } from "../checklist-rows";

/** One item New task holds until Create. The id only keys the row; the words are what's posted. */
export type NewChecklistItem = { id: string; title: string };

let made = 0;
/** A row's key, unique on this page. */
export const newItemId = () => `i${Date.now().toString(36)}${(made++).toString(36)}`;

/**
 * New task's Checklist (docs/specs/new-task-checklist-photos.md, Q1 B and section 3.1): always shown, under Notes.
 * Make task's items lead it, as they always have: read only here, since each ticks itself once its row is filled in.
 * Then the items typed here, each the task page's row (the round box, not tickable yet, and a ⋯ with Delete item),
 * whose words change in place, and Add item, open from the start: Enter adds the next, a pasted list makes one item
 * per line. Up to 100 items.
 */
export function NewTaskChecklist({
  items,
  onChange,
  fixed = [],
}: {
  items: readonly NewChecklistItem[];
  onChange: (items: NewChecklistItem[]) => void;
  /** Make task's items (docs/specs/missing-info.md, D9). */
  fixed?: readonly string[];
}) {
  const heading = useId();
  const room = NEW_CHECKLIST_MAX - fixed.length - items.length;
  return (
    <div role="group" aria-labelledby={heading} className="flex min-w-0 flex-col gap-1.5">
      <p id={heading} className="text-meta font-medium text-fg-2">
        Checklist
      </p>
      <div>
        {fixed.length > 0 && (
          <>
            <ul className="max-h-48 overflow-y-auto">
              {fixed.map((item, i) => (
                <li key={i} className="flex min-h-9 items-center gap-2.5 text-body text-foreground pointer-coarse:min-h-11">
                  <InertBox />
                  <span className="min-w-0 truncate">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mb-1 truncate text-meta text-muted-foreground">Each ticks itself once it&apos;s filled in.</p>
          </>
        )}
        {items.length > 0 && (
          <ul>
            {items.map((item) => (
              <ChecklistItemRow key={item.id} title={item.title} box={<InertBox />} onDelete={() => onChange(items.filter((x) => x.id !== item.id))}>
                <ItemWords value={item.title} onSave={(title) => onChange(items.map((x) => (x.id === item.id ? { ...x, title } : x)))} />
              </ChecklistItemRow>
            ))}
          </ul>
        )}
        <AddChecklistItem
          startOpen
          disabled={room <= 0}
          onAdd={(titles) => onChange([...items, ...titles.slice(0, Math.max(0, room)).map((title) => ({ id: newItemId(), title }))])}
        />
        {room <= 0 && <p className="truncate text-meta text-muted-foreground">{CHECKLIST_FULL}</p>}
      </div>
    </div>
  );
}

/**
 * An item's words, changed in place: they read as text and edit where they sit. Enter or leaving the field keeps the
 * change; Esc puts the words back. Emptied, they go back to what they were (Delete item takes an item off).
 */
function ItemWords({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  function keep() {
    const next = (draft ?? value).trim();
    setDraft(null);
    if (next && next !== value) onSave(next);
  }
  return (
    <textarea
      aria-label="Checklist item"
      rows={1}
      value={shown}
      maxLength={CHECKLIST_ITEM_MAX}
      autoComplete="off"
      data-1p-ignore
      onChange={(e) => setDraft(e.target.value.replace(/\r?\n/g, " "))}
      onBlur={keep}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          // Enter keeps the words; it never sends the task.
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.blur();
        }
        if (e.key === "Escape" && draft !== null) {
          // One Esc closes one layer: it puts the words back, and only the next one reaches the sheet.
          e.preventDefault();
          e.stopPropagation();
          setDraft(null);
          requestAnimationFrame(() => (e.target as HTMLTextAreaElement).blur());
        }
      }}
      className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent py-1.5 text-body text-foreground outline-none"
    />
  );
}
