"use client";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Sheet } from "@/components/sheet";
import { Button, Card, Textarea } from "@/components/ui";
import { setTaskStatus } from "./actions";
import { useStatusRun } from "./status-run";

/**
 * A job waiting on staff (D6b): "Zack marked this done · 4 photos" with
 * Approve (Done) and Send back (In progress, with a note the contractor
 * sees as a comment). A flat card, no shadow; Approve is the one primary
 * (ink), Send back secondary.
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
  const { run, pending } = useStatusRun();
  const [sendingBack, setSendingBack] = useState(false);
  // A note that didn't go through, to start the sheet with next time.
  const [draft, setDraft] = useState("");

  return (
    <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={fullName} size={24} outline={isContractor} />
        <p className="min-w-0 truncate text-body text-fg-1">
          <span className="font-medium">{name}</span> marked this done
          {photos > 0 && <span className="text-fg-3">{` · ${photos} ${photos === 1 ? "photo" : "photos"}`}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => setTaskStatus(taskId, "DONE", { expected: "REVIEW" }), { done: "Approved" })}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setSendingBack(true)}>
          Send back
        </Button>
      </div>
      <Sheet title={`Send back to ${name}`} isOpen={sendingBack} onOpenChange={setSendingBack}>
        {({ close }) => (
          <SendBackForm
            initial={draft}
            onSend={(note) => {
              close();
              setDraft("");
              run(() => setTaskStatus(taskId, "IN_PROGRESS", { note, expected: "REVIEW" }), {
                done: `Sent back to ${name}`,
                failed: () => setDraft(note),
              });
            }}
          />
        )}
      </Sheet>
    </Card>
  );
}

function SendBackForm({ initial, onSend }: { initial: string; onSend: (note: string) => void }) {
  const [note, setNote] = useState(initial);
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
        <span className="text-meta font-medium text-fg-2">What needs another look?</span>
        <Textarea value={note} rows={3} autoFocus required maxLength={5000} onChange={(e) => setNote(e.target.value)} className="mt-1.5" />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={!ok}>
          Send back
        </Button>
      </div>
    </form>
  );
}
