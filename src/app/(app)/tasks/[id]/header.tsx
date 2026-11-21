"use client";
import { useState, useTransition } from "react";
import { Ellipsis, Link2, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InlineField } from "@/components/inline-field";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { deleteTask, updateTask } from "./actions";

/**
 * The title on the page title token, edited in place. At rest it's the
 * page's h1; a click or a tap swaps in the field, as on the property page.
 * Long titles wrap. Done and Canceled strike it through in --muted-foreground, since the
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
      className={cn(closed && "text-muted-foreground line-through")}
      onSave={(next) => updateTask(taskId, { title: next })}
    />
  );
}

/**
 * "…": Copy link, Delete. A draft from Claude has Copy link alone: its banner's Discard is the way out, with an
 * Undo (a delete would take it, its photos and its comments for good, and the service refuses it).
 */
export function MoreMenu({ taskId, title, draft = false }: { taskId: string; title: string; draft?: boolean }) {
  const { toast } = useToast();
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
          className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-muted-foreground data-pressed:bg-muted")}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </AriaButton>
        <Menu>
          <MenuItem icon={<Link2 />} onAction={copyLink}>
            Copy link
          </MenuItem>
          {!draft && <MenuSeparator />}
          {!draft && (
            <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => setConfirming(true)}>
              Delete
            </MenuItem>
          )}
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
