"use client";
import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/sheet";
import { Button, Textarea } from "@/components/ui";
import { assigneeName, type ListTask } from "@/lib/tasks/list";
import { useTaskList } from "./task-list-context";

/**
 * Approve and Send back on a job in Needs review (D6b). Approve makes it
 * Done. Send back asks for a short note the contractor sees, then returns
 * the job to In progress.
 */
export function ReviewActions({ task }: { task: ListTask }) {
  const { approve, sendBack, sendBackDraft } = useTaskList();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(() => sendBackDraft(task.id));
  const first = assigneeName(task.assignee)?.split(" ")[0];

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (!text) return;
    setOpen(false);
    setNote("");
    sendBack(task, text);
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Send back
      </Button>
      <Button variant="secondary" size="sm" onClick={() => approve(task)}>
        Approve
      </Button>
      <Sheet isOpen={open} onOpenChange={setOpen} title={first ? `Send back to ${first}` : "Send back"}>
        <form onSubmit={submit} className="space-y-3 p-4 md:w-96">
          <p className="truncate text-body text-fg-3">{task.title}</p>
          <Textarea
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
            placeholder="What still needs doing?"
            maxLength={2000}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!note.trim()}>
              Send back
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
