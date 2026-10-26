"use client";
import { useState, useTransition } from "react";
import { Ban, Ellipsis, Link2, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { TaskStatus } from "@prisma/client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InlineField } from "@/components/inline-field";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus, updateTask } from "./actions";
import { useStatusRun } from "./status-run";

/**
 * The title on the page title token, edited in place. At rest it's the
 * page's h1; a click or a tap swaps in the field, as on the property page.
 * Long titles wrap. Done and Canceled strike it through in --fg-3, since the
 * status chip carries no strike (docs/brand-guidelines.md, section 9).
 */
export function TitleField({ taskId, title, closed }: { taskId: string; title: string; closed: boolean }) {
  return (
    <InlineField
      kind="heading"
      label="Task title"
      context="Task title"
      value={title}
      // "Enter at least 2 characters." under the open field, in place of a silent revert (BTASKS-013).
      minLength={2}
      message={() => "Task renamed"}
      className={cn(closed && "text-fg-3 line-through")}
      onSave={(next) => updateTask(taskId, { title: next })}
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
