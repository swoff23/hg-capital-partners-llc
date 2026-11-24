"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { draftBannerLine, type DraftContractor, type DraftPeople } from "@/lib/tasks/drafts";
import { addDraftTask, discardDraftTask, restoreDraftTasks, undoAddDraftTasks } from "../draft-actions";
import { addedLine, discardedLine, undoAddLine, undoDiscardLine } from "../draft-copy";
import { focusPageTitle } from "../draft-focus";
import { useStatusRun } from "./status-run";

/**
 * What a draft from Claude shows in place of the status control
 * (docs/specs/tasks-from-claude.md 6.4): the same flat card the Review banner
 * is, "Draft from Claude", one line only when it prevents a mistake (who
 * hears when it's added, from the record), then Discard and Add task. On a
 * phone the card stacks and the buttons split its width. Add and Discard do
 * what they do in the list; Discard goes back to the Tasks list, where its
 * Undo toast is still showing. This page's own Undos (Add's here, Discard's
 * from the list) wait for the server's answer before anything redraws: the
 * page has no list row to draw at once. Add shares the page's one
 * status run, so while it saves the page doesn't take a second change. When
 * Add takes the banner away, focus goes to the title, not the page body.
 * `people` is everyone the pickers list, so two people who share a first name
 * are told apart by their full names.
 */
export function DraftBanner({ taskId, contractor, people }: { taskId: string; contractor: DraftContractor | null; people: DraftPeople }) {
  const { run, pending, toast } = useStatusRun();
  const router = useRouter();
  const line = draftBannerLine(contractor, people);
  // Set once Add has answered: the banner goes with the refresh, and its button with it.
  const added = useRef(false);
  useEffect(() => () => {
    if (added.current) focusPageTitle();
  }, []);
  // Both buttons are disabled while Add saves, which drops focus to the page. A refused Add puts it back on Add task.
  const refused = useRef(false);
  const buttons = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending || !refused.current) return;
    refused.current = false;
    buttons.current?.querySelector<HTMLElement>("button:last-of-type")?.focus({ preventScroll: true });
  }, [pending]);

  function add() {
    run(() => addDraftTask(taskId), {
      failed: () => {
        refused.current = true;
      },
      succeeded: (out) => {
        added.current = true;
        toast({
          ...addedLine([out.contractor], people),
          action: {
            label: "Undo",
            onAction: () =>
              run(() => undoAddDraftTasks([{ taskId, addEventId: out.addEventId }]), {
                succeeded: (back) => {
                  const refused = undoAddLine(1, back.undone.length, back.kept);
                  if (refused) toast(refused);
                },
              }),
          },
        });
      },
    });
  }

  function discard() {
    run(() => discardDraftTask(taskId), {
      succeeded: ({ ids }) => {
        router.push("/tasks");
        // Nobody to undo when someone else discarded it first: what was asked is true.
        if (ids.length === 0) return;
        toast({
          ...discardedLine(ids.length),
          // Not through `run`: this page is gone by then, and its run with it.
          action: {
            label: "Undo",
            onAction: async () => {
              const res = await callAction(() => restoreDraftTasks(ids));
              if (!res.ok) {
                toast({ message: res.error });
                return;
              }
              const gone = undoDiscardLine(ids.length, res.data.restored.length, res.data.gone.length);
              if (gone) toast(gone);
            },
          },
        });
      },
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-body font-medium text-foreground">Draft from Claude</p>
        {line && <p className="text-meta text-muted-foreground">{line}</p>}
      </div>
      <div ref={buttons} className="flex shrink-0 gap-2 max-sm:[&>*]:flex-1">
        <Button size="sm" variant="secondary" disabled={pending} onClick={discard}>
          Discard
        </Button>
        <Button size="sm" disabled={pending} onClick={add}>
          Add task
        </Button>
      </div>
    </Card>
  );
}
