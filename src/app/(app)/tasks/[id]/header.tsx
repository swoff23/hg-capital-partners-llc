"use client";
import { useState, useTransition } from "react";
import { Ban, Ellipsis, Link2, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { TaskStatus } from "@prisma/client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InlineAddressField } from "@/components/inline-address-field";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus, updateTask } from "./actions";
import { useStatusRun } from "./status-run";
import { useRun } from "./use-run";

/**
 * The title on the page title token, edited in place. At rest it's the
 * page's h1; a click or a tap swaps in the field, as on the property page.
 * Long titles wrap. Done and Canceled strike it through in --fg-3, since the
 * status chip carries no strike (docs/brand-guidelines.md, section 9).
 */
export function TitleField({ taskId, title, closed }: { taskId: string; title: string; closed: boolean }) {
  const { toast } = useRun();
  return (
    <InlineAddressField
      label="Task title"
      value={title}
      minLength={2}
      heading
      multiline
      className={cn(closed && "text-fg-3 line-through")}
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
          className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-fg-3 data-pressed:bg-fill-1")}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
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
