"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { assigneeName, type ListTask } from "@/lib/tasks/list";
import { SendBackSheet } from "./send-back-sheet";
import { useTaskList } from "./task-list-context";

/**
 * Send back and Approve on a job in Needs review (D6b), in that order, as on
 * the task page's banner, one step lighter in a list: ghost, then secondary.
 * Approve makes it Done and toasts with an Undo; Send back opens the one Send
 * back sheet for a note the contractor sees, then returns the job to In
 * progress.
 */
export function ReviewActions({ task }: { task: ListTask }) {
  const { approve, sendBack, sendBackDraft } = useTaskList();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(() => sendBackDraft(task.id));
  const first = assigneeName(task.assignee)?.split(" ")[0] ?? null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Send back
      </Button>
      <Button variant="secondary" size="sm" onClick={() => approve(task)}>
        Approve
      </Button>
      <SendBackSheet
        isOpen={open}
        onOpenChange={setOpen}
        name={first}
        // A row doesn't know whether they can sign in, so the sheet promises the note and nothing about email.
        hasLogin
        taskTitle={task.title}
        value={note}
        onChange={setNote}
        onSend={(text) => {
          setOpen(false);
          setNote("");
          sendBack(task, text);
        }}
      />
    </>
  );
}
