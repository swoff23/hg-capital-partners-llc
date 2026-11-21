"use client";
import { useState, useTransition } from "react";
import { Ellipsis, Pencil, RotateCcw, SquareCheckBig, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { useRun } from "@/components/use-run";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { EditRehabSheet, type PropertyOption } from "../new-rehab";
import { deleteRehabAction, setRehabDoneAction } from "../actions";

/** "…": Edit rehab, Mark done or Reopen, and Delete rehab (asked once more). Delete goes back to Draws. */
export function MoreMenu({
  rehabId,
  name,
  done,
  edit,
}: {
  rehabId: string;
  name: string;
  done: boolean;
  edit: { lender: string; propertyIds: string[]; options: PropertyOption[] };
}) {
  const [editing, setEditing] = useState(false);
  const run = useRun();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  function toggle() {
    run.run(() => setRehabDoneAction(rehabId, !done), {
      done: done ? `${name} reopened` : `${name} marked done`,
      key: `rehab:${rehabId}:done`,
      undo: () => setRehabDoneAction(rehabId, done),
    });
  }

  function remove() {
    startDelete(async () => {
      // A redirect() from the action rejects with Next's own error, which callAction lets through.
      const res = await callAction(async () => {
        const r = await deleteRehabAction(rehabId);
        return r.ok ? { ok: true as const, data: undefined } : r;
      });
      if (!res.ok) {
        run.toast({ message: res.error });
        setConfirming(false);
      }
    });
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
          {!done && (
            <MenuItem icon={<Pencil />} onAction={() => setEditing(true)}>
              Edit rehab
            </MenuItem>
          )}
          <MenuItem icon={done ? <RotateCcw /> : <SquareCheckBig />} onAction={toggle}>
            {done ? "Reopen" : "Mark done"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => setConfirming(true)}>
            Delete rehab
          </MenuItem>
        </Menu>
      </MenuTrigger>
      {editing && (
        <EditRehabSheet
          rehabId={rehabId}
          initial={{ name, lender: edit.lender, propertyIds: edit.propertyIds }}
          options={edit.options}
          isOpen
          onOpenChange={setEditing}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete this rehab?"
          body="Its budget lines and draws go for good."
          onClose={() => !deleting && setConfirming(false)}
          cancelLabel="Keep it"
          busy={deleting}
          actions={
            <Button variant="destructive" size="sm" disabled={deleting} onClick={remove}>
              {deleting ? "Deleting…" : "Delete rehab"}
            </Button>
          }
        />
      )}
    </>
  );
}
