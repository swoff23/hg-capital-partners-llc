"use client";
import { Archive, ArchiveRestore, Ellipsis, Link2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { Notice } from "@/components/source-line";
import { Button, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import type { ActionResult } from "@/lib/action-result";
import { archiveToast, type ArchiveKind } from "@/lib/archive";
import { cn } from "@/lib/utils";

/**
 * Archive and Restore on a record's page (src/lib/archive.ts): the ⋯ menu in
 * its header and the line above it while it's archived. Linear's, Stripe's
 * and HubSpot's pattern: Archive goes at once, with a toast and Undo, and the
 * page stays open and says it's archived, with Restore.
 *
 *   <RecordMoreMenu kind="deal" id={deal.id} href={`/deals/${deal.id}`} archived={false} action={setDealArchived} />
 *   {deal.archivedAt && <ArchivedNotice kind="deal" id={deal.id} line="Connor archived this today." action={setDealArchived} />}
 *
 * `action` is the record's server action, `(id, archived)`. A refusal (a
 * contractor with open jobs) comes back as its one line in a toast;
 * `refusal` shows it under Archive before anyone tries.
 */

type ArchiveAction = (id: string, archived: boolean) => Promise<ActionResult>;

/** Archive or restore, with the toast and its Undo. One toast per record, so a quick Undo replaces it. */
function useArchive(kind: ArchiveKind, id: string, action: ArchiveAction) {
  const { run, pending, toast } = useRun();
  const change = (archived: boolean) =>
    run(() => action(id, archived), {
      done: archiveToast(kind, archived),
      key: `archive:${kind}:${id}`,
      undo: () => action(id, !archived),
    });
  return { change, pending, toast };
}

/** The record's ⋯ menu: Copy link, then Archive, or Restore while it's archived. */
export function RecordMoreMenu({
  kind,
  id,
  href,
  archived,
  refusal,
  action,
}: {
  kind: ArchiveKind;
  id: string;
  /** The page's path, for Copy link: "/deals/abc". */
  href: string;
  archived: boolean;
  /** Why Archive won't go through yet, named under it ("Reassign their 3 open jobs first."). */
  refusal?: string | null;
  action: ArchiveAction;
}) {
  const { change, pending, toast } = useArchive(kind, id, action);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      toast({ message: "Link copied" });
    } catch {
      toast({ message: "Couldn't copy the link." });
    }
  }

  return (
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
        <MenuSeparator />
        {archived ? (
          <MenuItem icon={<ArchiveRestore />} isDisabled={pending} onAction={() => change(false)}>
            Restore
          </MenuItem>
        ) : (
          // Still pressable when refused: the server has the last word, and a tap says why in the toast.
          <MenuItem icon={<Archive />} isDisabled={pending} description={refusal ?? undefined} onAction={() => change(true)}>
            Archive
          </MenuItem>
        )}
      </Menu>
    </MenuTrigger>
  );
}

/** Above an archived record: who archived it and when, and Restore. */
export function ArchivedNotice({
  kind,
  id,
  line,
  action,
  className,
}: {
  kind: ArchiveKind;
  id: string;
  /** "Connor archived this today." (archivedLine). */
  line: string;
  action: ArchiveAction;
  className?: string;
}) {
  const { change, pending } = useArchive(kind, id, action);
  return (
    <Notice
      className={className}
      icon={<Archive aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-fg-3" />}
      action={
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => change(false)}>
          Restore
        </Button>
      }
    >
      {line}
    </Notice>
  );
}
