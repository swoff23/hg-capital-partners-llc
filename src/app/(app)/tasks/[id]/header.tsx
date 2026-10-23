"use client";
import { useState, useTransition } from "react";
import { Ban, Ellipsis, Link2, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { TaskStatus } from "@prisma/client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InlineAddressField } from "@/components/inline-address-field";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { Button } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus, updateTask } from "./actions";
import { useStatusRun } from "./status-run";
import { useRun } from "./use-run";

/** The title, edited in place. Long titles wrap. */
export function TitleField({ taskId, title, closed }: { taskId: string; title: string; closed: boolean }) {
  const { toast } = useRun();
  return (
    <InlineAddressField
      label="Task title"
      value={title}
      minLength={2}
      multiline
      className={cn("text-xl sm:text-2xl", closed && "text-muted line-through")}
      onCommit={async (next) => {
        const res = await callAction(() => updateTask(taskId, { title: next }));
        if (!res.ok) toast({ message: res.error });
      }}
    />
  );
}

/** "…": Copy link, Cancel task, Delete. */
export function MoreMenu({
  taskId,
  title,
  active,
  status,
  waitingOn,
}: {
  taskId: string;
  title: string;
  active: boolean;
  status: TaskStatus;
  waitingOn: string | null;
}) {
  const { run, pending, toast } = useStatusRun();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  function remove() {
    startDelete(async () => {
      // Success redirects to the task list, which callAction lets through.
      const res = await callAction(async () => {
        await deleteTask(taskId);
        return { ok: true, data: undefined };
      });
      if (!res.ok) toast({ message: res.error });
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskId}`);
      toast({ message: "Link copied" });
    } catch {
      toast({ message: "Couldn't copy the link." });
    }
  }

  return (
    <>
      <MenuTrigger>
        <AriaButton
          aria-label="More actions"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-surface hover:text-foreground data-focus-visible:ring-2 data-focus-visible:ring-primary/30 data-pressed:bg-surface pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </AriaButton>
        <Menu>
          <MenuItem icon={<Link2 />} onAction={copyLink}>
            Copy link
          </MenuItem>
          {active && (
            <MenuItem
              icon={<Ban />}
              isDisabled={pending}
              onAction={() =>
                run(() => setTaskStatus(taskId, "CANCELED", { expected: status }), {
                  done: "Task canceled",
                  undo: () => setTaskStatus(taskId, status, { expected: "CANCELED", ...(status === "WAITING" ? { waitingOn } : {}) }),
                })
              }
            >
              Cancel task
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => setConfirming(true)}>
            Delete
          </MenuItem>
        </Menu>
      </MenuTrigger>
      {confirming && (
        <ConfirmDialog
          title="Delete this task?"
          body={`“${title}” goes for good, with its notes, checklist, activity and files.`}
          onClose={() => !deleting && setConfirming(false)}
          cancelLabel="Keep it"
          busy={deleting}
          actions={
            <Button variant="destructive" size="sm" disabled={deleting} onClick={remove}>
              {deleting ? "Deleting…" : "Delete task"}
            </Button>
          }
        />
      )}
    </>
  );
}
