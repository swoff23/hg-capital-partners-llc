"use client";
import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { FormField, Textarea } from "@/components/ui";

/** The most a send-back note holds, the same on the task page, Today's rows and both servers (forms 4.4). */
export const SEND_BACK_NOTE_MAX = 2000;
/** The count shows from here. */
const COUNT_FROM = 1800;

/**
 * The words under the note: what Send back does (forms 4.4, build plan
 * conflict 13). Without a login there is no email to promise.
 */
export function sendBackHelper(name: string | null, hasLogin: boolean): string {
  if (!name) return "Goes back to In progress with your note.";
  return hasLogin ? `Goes back to In progress with your note for ${name}.` : `Goes back to In progress. ${name} has no login yet.`;
}

/**
 * The one Send back sheet, for the task page's Review banner and Today's
 * Needs review rows (activity 2.8, forms 4.4). A `FormSheet`: the label
 * "What still needs doing?", the note up to 2,000 characters with a count from
 * 1,800, one helper line saying what happens next, Cancel with Esc and Send
 * back with the mod key and Enter. The caller holds the note (`value`), so it
 * survives closing the sheet and a send that failed; a note is required, and
 * the sheet says so once you try without one.
 *
 *   <SendBackSheet isOpen={open} onOpenChange={setOpen} name="Zack" hasLogin value={note} onChange={setNote} onSend={send} />
 */
export function SendBackSheet({
  isOpen,
  onOpenChange,
  name,
  hasLogin,
  taskTitle,
  value,
  onChange,
  onSend,
  pending = false,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contractor's first name; null when the job has none. */
  name: string | null;
  /** They can sign in, so the send-back reaches them by email. */
  hasLogin: boolean;
  /** Which job, where the sheet can't be read against its row (Today). */
  taskTitle?: string;
  value: string;
  onChange: (note: string) => void;
  /** Gets the trimmed note; the caller closes the sheet and runs the change. */
  onSend: (note: string) => void;
  pending?: boolean;
}) {
  const [tried, setTried] = useState(false);
  const note = value.trim();
  const count = value.length;

  return (
    <FormSheet
      title={name ? `Send back to ${name}` : "Send back"}
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setTried(false);
      }}
      primary="Send back"
      pending={pending}
      // The note is kept by the caller across closes, so closing never asks "Discard?".
      dirty={false}
      onSubmit={() => {
        if (!note) return setTried(true);
        onSend(note);
      }}
    >
      {taskTitle && <p className="truncate text-body text-fg-3">{taskTitle}</p>}
      <FormField
        label="What still needs doing?"
        error={tried && !note ? "Add a short note for the contractor." : undefined}
        helper={
          <span className="flex min-w-0">
            <span className="min-w-0 truncate">{sendBackHelper(name, hasLogin)}</span>
            {count >= COUNT_FROM && (
              <span className="ml-auto shrink-0 pl-3 tabular-nums">
                {count.toLocaleString("en-US")} / {SEND_BACK_NOTE_MAX.toLocaleString("en-US")}
              </span>
            )}
          </span>
        }
      >
        {(p) => (
          <Textarea
            {...p}
            name="note"
            rows={3}
            required
            maxLength={SEND_BACK_NOTE_MAX}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setTried(false);
            }}
          />
        )}
      </FormField>
    </FormSheet>
  );
}
