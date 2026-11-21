import { draftsAddedNames, nameList, type DraftContractor, type DraftPeople } from "@/lib/tasks/drafts";
import type { ListTask } from "@/lib/tasks/list";

/**
 * What the draft rows and the draft's page say in a toast, and the rows they
 * show while a save is in flight (docs/specs/tasks-from-claude.md 6.3, 6.4).
 * A toast is one line that truncates: about 38 characters beside Undo on a
 * laptop, 32 on a 375 phone, 25 at 320 (lib/toast-line.ts, bulk-copy.ts is the
 * pattern). So the news leads, `detail` is the clause the toast cuts first, and
 * `phoneMessage` takes over under 375. Pure, so the lengths are tested
 * (draft-copy.test.ts). A refusal from the server is shown as it arrives: the
 * task service wrote those to fit (core.ts).
 */

export interface DraftLine {
  message: string;
  phoneMessage?: string;
  /** The clause after " · " that a short toast cuts first. */
  detail?: string;
}

/**
 * After Add or Add all. `added` holds one entry per task added; each person is
 * named once, apart from anyone else with their first name (`people`). Who
 * doesn't get the email leads, because that is what a partner would otherwise
 * assume wrongly; who does goes last, where the cut falls.
 */
export function addedLine(added: readonly (DraftContractor | null)[], people: DraftPeople = []): DraftLine {
  const { emailed, quiet } = draftsAddedNames(added, people);
  if (added.length === 1) {
    if (emailed.length) return { message: `Task added. Emails ${emailed[0]}.` };
    if (quiet.length) return { message: `Task added. No email to ${quiet[0]}.`, phoneMessage: `Added. No email to ${quiet[0]}.` };
    return { message: "Task added." };
  }
  const detail = emailed.length ? `Emails ${nameList(emailed)}` : undefined;
  if (quiet.length) return { message: `${added.length} added. No email to ${nameList(quiet)}.`, ...(detail ? { detail } : {}) };
  return { message: `${added.length} tasks added`, ...(detail ? { detail } : {}) };
}

/** After Discard or Discard all. */
export function discardedLine(count: number): DraftLine {
  return { message: count === 1 ? "Draft discarded." : `${count} drafts discarded.` };
}

/**
 * After Add's Undo, from what the server answered: nothing when every task
 * went back (the rows return, which says it), the server's own line when none
 * did ("Too late to undo."), and when some did, how many, with the first line
 * why not as the detail ("Zack already opened it").
 */
export function undoAddLine(total: number, undone: number, kept: readonly { message: string }[]): DraftLine | null {
  if (kept.length === 0) return null;
  if (undone === 0) return { message: kept[0].message };
  return { message: `${undone} of ${total} are drafts again`, detail: kept[0].message.replace(/\.$/, "") };
}

/** After Discard's Undo: nothing when every draft came back, "That draft is gone." when it was already cleared. */
export function undoDiscardLine(total: number, restored: number, gone: number): DraftLine | null {
  if (gone === 0) return null;
  if (restored === 0) return { message: total === 1 ? "That draft is gone." : "Those drafts are gone." };
  return { message: `${restored} of ${total} are drafts again`, detail: `${gone} ${gone === 1 ? "is" : "are"} gone` };
}

/**
 * A draft as the Tasks list holds it while a save is in flight. `group` is where its row sits ("mine" or the other
 * partner's id and first name), so an Undo can draw it back before the page's refresh brings its group back.
 */
export type DraftTask = ListTask & { group?: "mine" | { userId: string; name: string } };

/** What a draft row shows while its Add or Discard saves: gone, or back for an Undo. */
export type DraftChange = { kind: "hide"; ids: string[] } | { kind: "show"; tasks: DraftTask[] };

/** The drafts as they should look while a save is in flight (task-list-context.tsx). */
export function applyDraftChange(rows: DraftTask[], change: DraftChange): DraftTask[] {
  if (change.kind === "hide") {
    const gone = new Set(change.ids);
    return rows.filter((t) => !gone.has(t.id));
  }
  const have = new Set(rows.map((t) => t.id));
  // Newest first, as the server lists them (queries.ts draftTasks).
  return [...rows, ...change.tasks.filter((t) => !have.has(t.id))].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

/** The other partner's drafts as the page lists them: who they are and their rows. */
export interface DraftGroup {
  userId: string;
  name: string;
  tasks: ListTask[];
}

/**
 * The rows to draw, by section, from the provider's drafts (what is still shown, less any Add or Discard that is saving,
 * plus any Undo's rows). A row the page lists sits where the page puts it; a row only an Undo brought back says where it
 * sat itself (`group`), so the other partner's section is drawn again even when the page's refresh dropped it. A row
 * that says nothing and isn't listed is not drawn.
 */
export function groupDrafts(
  shown: readonly DraftTask[],
  mine: readonly ListTask[],
  others: readonly DraftGroup[],
): { mine: DraftTask[]; others: { userId: string; name: string; tasks: DraftTask[] }[] } {
  const mineIds = new Set(mine.map((t) => t.id));
  const ownerOf = new Map(others.flatMap((g) => g.tasks.map((t) => [t.id, g] as const)));
  const mineRows: DraftTask[] = [];
  const byOther = new Map<string, { userId: string; name: string; tasks: DraftTask[] }>();
  for (const t of shown) {
    const owner = ownerOf.get(t.id);
    const group = mineIds.has(t.id) ? "mine" : owner ? { userId: owner.userId, name: owner.name } : t.group;
    if (group === "mine") mineRows.push({ ...t, group });
    else if (group) {
      const there = byOther.get(group.userId) ?? { userId: group.userId, name: group.name, tasks: [] };
      there.tasks.push({ ...t, group });
      byOther.set(group.userId, there);
    }
  }
  return { mine: mineRows, others: [...byOther.values()] };
}
