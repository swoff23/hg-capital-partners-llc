"use client";
import { useRef, useState, type ReactNode } from "react";
import { Check, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { buttonClass } from "@/components/ui";
import { CHECKLIST_ITEM_MAX, NEW_CHECKLIST_MAX } from "@/lib/tasks/limits";
import { cn } from "@/lib/utils";

/**
 * A checklist's rows, shared by the task page (tasks/[id]/checklist.tsx, which saves each change) and New task's
 * Checklist section (tasks/new/new-task-checklist.tsx, which holds the items until Create): the round box, the item's
 * row with its ⋯ and Delete item, and Add item. With a mouse the ⋯ shows on the row; touch has no hover, so it stays.
 */


/**
 * A pasted list as items: one per line, trimmed, blank lines dropped, each held to the item limit. Null when the paste
 * is one line, which the field takes as typing.
 */
export function pastedItems(typed: string, pasted: string): string[] | null {
  if (!/\r|\n/.test(pasted)) return null;
  return `${typed}${pasted}`
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim().slice(0, CHECKLIST_ITEM_MAX))
    .filter(Boolean)
    .slice(0, NEW_CHECKLIST_MAX);
}

/** The round box: on an --input edge, filled with ink once ticked (docs/brand-guidelines.md, section 9). */
export const checkBoxClass = (done: boolean) =>
  cn(
    "relative flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
    done ? "border-primary bg-primary text-primary-foreground" : "border-input text-transparent",
  );

/** The box on New task, where nothing can be ticked yet: the same shape, not a control. */
export function InertBox() {
  return (
    <span aria-hidden="true" className={checkBoxClass(false)}>
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

/** One item: its box, its words and its ⋯ with Delete item. */
export function ChecklistItemRow({ title, box, onDelete, children }: { title: string; box: ReactNode; onDelete: () => void; children: ReactNode }) {
  return (
    <li className="group/item flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
      {box}
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      <MenuTrigger>
        <AriaButton
          aria-label={`${title} actions`}
          className={cn(
            buttonClass({ variant: "ghost", size: "sm", icon: true }),
            "-mr-2 shrink-0 text-muted-foreground data-pressed:bg-muted",
            // With a mouse the menu shows on the row; touch has no hover, so it stays.
            "pointer-fine:opacity-0 pointer-fine:focus-visible:opacity-100 pointer-fine:group-hover/item:opacity-100 pointer-fine:data-pressed:opacity-100",
          )}
        >
          <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </AriaButton>
        <Menu sheetTitle="Checklist item">
          <MenuItem variant="destructive" icon={<Trash2 />} onAction={onDelete}>
            Delete item
          </MenuItem>
        </Menu>
      </MenuTrigger>
    </li>
  );
}

/**
 * "Add item", then the row to type in: Enter adds it and keeps focus there for the next, a blur adds what's typed, and
 * Esc empties and closes it. A pasted list adds one item per line. `onAdd` gets the items and a way to put the words
 * back when they didn't save. `startOpen` opens the row at once (New task, where the section always shows it).
 */
export function AddChecklistItem({
  onAdd,
  startOpen = false,
  disabled = false,
}: {
  onAdd: (titles: string[], putBack: (text: string) => void) => void;
  startOpen?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Esc closes the row, and a browser may fire blur as the input goes away,
  // with the typed text still in that render's handler. This keeps that blur from adding it.
  const cancelled = useRef(false);
  // Put the text back if it didn't save, unless something newer was typed since.
  const putBack = (text: string) => setTitle((cur) => cur || text);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          // A fresh row: the blur after Esc never reaches onBlur in React 19 (the input is already gone), so this flag can be left set.
          cancelled.current = false;
          setOpen(true);
        }}
        className="-ml-1 mt-0.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-label text-fg-2 transition-colors hover:text-foreground disabled:opacity-50 pointer-coarse:h-11"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add item
      </button>
    );
  }

  /** Adds what's typed; Enter keeps focus here for the next one, a blur lets it go. */
  function add(keepFocus: boolean) {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    onAdd([t], putBack);
    if (keepFocus) input.current?.focus();
  }

  return (
    <div className="mt-0.5 flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
      <span className="size-4.5 shrink-0 rounded-full border border-dashed border-input" aria-hidden="true" />
      <input
        ref={input}
        // Opened by a tap it takes focus; open from the start (New task) it waits for one.
        autoFocus={!startOpen}
        aria-label="New checklist item"
        placeholder="Add item"
        value={title}
        maxLength={CHECKLIST_ITEM_MAX}
        disabled={disabled}
        // Free text, not a login: password managers keep their icon and menu off it.
        autoComplete="off"
        data-1p-ignore
        onChange={(e) => setTitle(e.target.value)}
        onPaste={(e) => {
          const items = pastedItems(title, e.clipboardData.getData("text"));
          if (!items) return;
          e.preventDefault();
          setTitle("");
          if (items.length) onAdd(items, () => {});
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            // Inside New task's form, Enter here adds the item and never sends the task.
            e.stopPropagation();
            add(true);
          }
          if (e.key === "Escape" && (title || !startOpen)) {
            // One Esc closes one layer: it empties the row first, and only then reaches the sheet.
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            setTitle("");
            if (!startOpen) setOpen(false);
          }
        }}
        onBlur={() => {
          if (!cancelled.current && title.trim()) add(false);
          cancelled.current = false;
          if (!startOpen) setOpen(false);
        }}
        className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
