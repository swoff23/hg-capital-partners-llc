"use client";
import { useRef, useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import type { TaskAttachment } from "@/lib/task-types";
import {
  toggleTask,
  patchTask,
  addTaskAttachment,
  removeTaskAttachment,
} from "../actions";

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

/** Quiet inline control: no border at rest, fills on hover/focus. */
const quiet =
  "-mx-2 w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-40";

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 4.5L6 7.5l3-3" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Mark complete
 * ------------------------------------------------------------------ */

export function CompleteButton({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => toggleTask(id))}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition-colors",
        done
          ? "border-green-600/40 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/60 dark:text-green-300 dark:hover:bg-green-900/60"
          : "border-border bg-surface text-foreground hover:bg-background",
        pending && "opacity-50",
      )}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      {done ? "Completed" : "Mark complete"}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

export function TitleField({ id, value, done }: { id: string; value: string; done: boolean }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  if (value !== seen) {
    setSeen(value);
    setV(value);
  }

  function commit() {
    const trimmed = v.trim();
    if (trimmed.length >= 2 && trimmed !== value) start(() => patchTask(id, { title: trimmed }));
    else if (trimmed !== value) setV(value);
  }

  return (
    <input
      aria-label="Task title"
      value={v}
      disabled={pending}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setV(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "-mx-2 w-full rounded-md bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight outline-none transition-colors",
        "hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/20",
        done && "text-muted line-through",
      )}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Assignee
 * ------------------------------------------------------------------ */

export function AssigneeControl({
  id,
  value,
  label,
  users,
}: {
  id: string;
  value: string | null;
  label: string | null;
  users: { id: string; name: string | null; email: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          label ? "bg-accent text-primary" : "border border-dashed border-border text-muted",
        )}
      >
        {label ? initials(label) : "?"}
      </span>
      <div className="relative min-w-0 flex-1">
        <select
          aria-label="Assignee"
          value={value ?? ""}
          disabled={pending}
          onChange={(e) => start(() => patchTask(id, { assigneeUserId: e.target.value || null }))}
          className={cn(quiet, "appearance-none pr-7", !value && !label && "text-muted")}
        >
          <option value="">{label ? `${label} — external` : "Unassigned"}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
        <Chevron />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Due date
 * ------------------------------------------------------------------ */

export function DueDateControl({ id, value }: { id: string; value: string | null }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      aria-label="Due date"
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => start(() => patchTask(id, { dueDate: e.target.value || null }))}
      className={cn(quiet, "[color-scheme:light] dark:[color-scheme:dark]", !value && "text-muted")}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Project / property
 * ------------------------------------------------------------------ */

export function PropertyControl({
  id,
  value,
  properties,
}: {
  id: string;
  value: string | null;
  properties: { id: string; address: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <div className="relative">
      <select
        aria-label="Project"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => start(() => patchTask(id, { propertyId: e.target.value || null }))}
        className={cn(quiet, "appearance-none pr-7", !value && "text-muted")}
      >
        <option value="">No project</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.address}
          </option>
        ))}
      </select>
      <Chevron />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Description
 * ------------------------------------------------------------------ */

export function DescriptionField({ id, value }: { id: string; value: string | null }) {
  const [v, setV] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  if (value !== seen) {
    setSeen(value);
    setV(value ?? "");
  }

  function commit() {
    if (v.trim() !== (value ?? "").trim()) start(() => patchTask(id, { description: v }));
  }

  return (
    <textarea
      aria-label="Description"
      value={v}
      disabled={pending}
      rows={4}
      placeholder="What is this task about?"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      className="min-h-[6rem] w-full resize-y rounded-lg bg-transparent p-0 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted focus:outline-none disabled:opacity-40"
    />
  );
}

/* ------------------------------------------------------------------ *
 * Attachments (links)
 * ------------------------------------------------------------------ */

function LinkIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6.5 9.5l3-3M7 4.5l.8-.8a2.5 2.5 0 013.5 3.5l-.8.8M9 11.5l-.8.8a2.5 2.5 0 01-3.5-3.5l.8-.8" />
    </svg>
  );
}

export function AttachmentsSection({
  id,
  attachments,
}: {
  id: string;
  attachments: TaskAttachment[];
}) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {attachments.map((a, i) => (
            <li key={`${a.url}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              <LinkIcon />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-primary hover:underline"
                title={a.url}
              >
                {a.title}
              </a>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => removeTaskAttachment(id, i))}
                className="shrink-0 text-xs text-muted transition-colors hover:text-red-600 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            await addTaskAttachment(id, fd);
            formRef.current?.reset();
          })
        }
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          name="url"
          type="text"
          inputMode="url"
          required
          placeholder="Paste a link (Drive, Dropbox, photo…)"
          className="sm:flex-1"
        />
        <Input name="title" placeholder="Label (optional)" className="sm:w-44" />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add link"}
        </Button>
      </form>
    </div>
  );
}
