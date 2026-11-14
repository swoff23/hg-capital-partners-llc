"use client";
import { useState, useTransition } from "react";
import { Ellipsis, Link2, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { Button, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { deleteLeaseAndGo } from "./actions";

/** "…": Copy link, Delete lease (asked once more). Success redirects to the Tenants list. */
export function MoreMenu({ leaseId }: { leaseId: string }) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  function remove() {
    startDelete(async () => {
      // A redirect() from the action rejects with Next's own error, which callAction lets through.
      const res = await callAction(async () => {
        await deleteLeaseAndGo(leaseId);
        return { ok: true, data: undefined };
      });
      if (!res.ok) toast({ message: res.error });
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tenants/${leaseId}`);
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
          <MenuSeparator />
          <MenuItem variant="destructive" icon={<Trash2 />} onAction={() => setConfirming(true)}>
            Delete lease
          </MenuItem>
        </Menu>
      </MenuTrigger>
      {confirming && (
        <ConfirmDialog
          title="Delete this lease?"
          body="Its tenants stay in the app, but this stay, its terms and its files go for good."
          onClose={() => !deleting && setConfirming(false)}
          cancelLabel="Keep it"
          busy={deleting}
          actions={
            <Button variant="destructive" size="sm" disabled={deleting} onClick={remove}>
              {deleting ? "Deleting…" : "Delete lease"}
            </Button>
          }
        />
      )}
    </>
  );
}
