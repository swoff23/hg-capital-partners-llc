"use client";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Sheet } from "@/components/sheet";
import { Button, Textarea } from "@/components/ui";
import { setTaskStatus } from "./actions";
import { useRun } from "./use-run";

/**
 * A job waiting on staff (D6b): "Zack marked this done · 4 photos" with
 * Approve (Done) and Send back (In progress, with a note the contractor
 * sees as a comment).
 */
export function ReviewBanner({
  taskId,
  name,
  fullName,
  isContractor,
  photos,
}: {
  taskId: string;
  /** First name, for the sentence. */
  name: string;
  /** For the avatar's initials. */
  fullName: string;
  isContractor: boolean;
  photos: number;
}) {
  const { run, pending } = useRun();
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={fullName} size={24} outline={isContractor} />
        <p className="min-w-0 truncate text-sm">
          <span className="font-medium">{name}</span> marked this done
          {photos > 0 && <span className="text-muted">{` · ${photos} ${photos === 1 ? "photo" : "photos"}`}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => setTaskStatus(taskId, "DONE"), { done: "Approved" })}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setSendingBack(true)}>
          Send back
        </Button>
      </div>
      <Sheet title={`Send back to ${name}`} isOpen={sendingBack} onOpenChange={setSendingBack}>
        {({ close }) => (
          <SendBackForm
            onSend={(note) => {
              close();
              run(() => setTaskStatus(taskId, "IN_PROGRESS", { note }), { done: `Sent back to ${name}` });
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function SendBackForm({ onSend }: { onSend: (note: string) => void }) {
  const [note, setNote] = useState("");
  const ok = note.trim().length > 0;
  return (
    <form
      className="space-y-3 p-4 md:w-96"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSend(note.trim());
      }}
    >
      <label className="block">
        <span className="text-xs font-medium text-muted">What needs another look?</span>
        <Textarea value={note} rows={3} autoFocus required maxLength={5000} onChange={(e) => setNote(e.target.value)} className="mt-1" />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={!ok}>
          Send back
        </Button>
      </div>
    </form>
  );
}
