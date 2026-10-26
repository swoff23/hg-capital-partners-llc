"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Badge, Button, EmptyState, flushTable, Table, Td, Th } from "@/components/ui";
import { PhotoThumb } from "@/components/photo-thumb";
import { SearchInput } from "@/components/search-field";
import { Select } from "@/components/select";
import type { OptionItem, OptionSection } from "@/components/option-list";
import { Tooltip } from "@/components/tooltip";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import type { PropertyOption } from "@/lib/picker-options-shape";
import { classLeaf, mapsToKey, mapsToMessage, parseMapsTo, type ClassTarget } from "@/lib/quickbooks/mapping";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, ROLE_LABELS } from "../_components/labels";
import { mapClass, restoreClassMapping, setAccountCategory } from "./actions";

const CATEGORY_ITEMS: OptionItem[] = Object.keys(CATEGORY_LABELS).map((id) => ({ id, label: CATEGORY_LABELS[id] }));

/* A row that holds a select keeps the 40px row with a mouse (48 on touch):
   the select drops to the 32px sm control size, and the cell's padding
   shrinks around it. Text cells center on the same line. */
const cell = "py-1 align-middle pointer-coarse:py-0.5";

/**
 * A row saves where it stands: it dims to 50% while the server answers and
 * the page refreshes, stays focusable so a keyboard user keeps their place,
 * and the rest of the table stays usable (selectors 2, Commit and feedback).
 * Not optimistic: the new value shows when the page does. `busy` holds the
 * ids of the rows mid-save, and lets go by itself when the refresh lands.
 */
function useRowSaves() {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busy, markBusy] = useOptimistic<ReadonlySet<string>, string>(new Set(), (cur, id) => new Set(cur).add(id));

  /** Runs one row's save, then refreshes. A failure is a toast, and the row shows its saved value again. */
  function save(rowId: string, run: () => Promise<unknown>, done?: { message: string; undo: () => void }) {
    startTransition(async () => {
      markBusy(rowId);
      const res = await callAction(async () => {
        await run();
        return { ok: true as const, data: undefined };
      });
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      if (done) toast({ message: done.message, key: `settings:${rowId}`, action: { label: "Undo", onAction: done.undo } });
      router.refresh();
    });
  }
  return { busy, save };
}

type ClassRow = {
  id: string;
  fqn: string;
  role: string;
  propertyId: string | null;
  entityId: string | null;
  autoMatched: boolean;
  note: string | null;
};

const targetOf = (c: ClassRow): ClassTarget => ({
  role: c.role as ClassTarget["role"],
  propertyId: c.propertyId,
  entityId: c.entityId,
});

/**
 * Each QuickBooks class maps to one thing (selectors 5, forms 4.8): a
 * property, an entity, Overhead, Ignore, or nothing yet. One "Maps to" pick
 * sets the role and the target together and saves on pick, only that row
 * dimming; the toast says what changed and Undo puts the class back exactly
 * as it was, auto-match included. Below sm the pick opens in its own titled
 * sheet.
 */
export function ClassMappingTable({
  classes,
  properties,
  entities,
}: {
  classes: ClassRow[];
  properties: PropertyOption[];
  entities: { id: string; name: string }[];
}) {
  const { busy, save } = useRowSaves();

  const sections = useMemo<OptionSection[]>(
    () => [
      {
        id: "properties",
        title: "Properties",
        items: properties.map((p) => ({
          id: `p:${p.id}`,
          label: p.label,
          searchText: p.address,
          leading: <PhotoThumb size={32} src={p.photoUrl} alt="" />,
        })),
      },
      { id: "entities", title: "Entities", items: entities.map((e) => ({ id: `e:${e.id}`, label: e.name })) },
      {
        id: "other",
        title: "Other",
        items: [
          { id: "OVERHEAD", label: ROLE_LABELS.OVERHEAD },
          { id: "IGNORE", label: ROLE_LABELS.IGNORE },
        ],
      },
    ],
    [properties, entities],
  );
  const nameOfKey = (key: string | null): string | null => {
    const pick = parseMapsTo(key);
    if (!pick || pick.kind === "unmapped") return null;
    if (pick.kind === "property") return properties.find((p) => p.id === pick.propertyId)?.label ?? null;
    if (pick.kind === "entity") return entities.find((e) => e.id === pick.entityId)?.name ?? null;
    return pick.kind === "overhead" ? ROLE_LABELS.OVERHEAD : ROLE_LABELS.IGNORE;
  };

  function mapsTo(c: ClassRow, key: string | null) {
    const pick = parseMapsTo(key);
    if (!pick) return;
    const before = { ...targetOf(c), autoMatched: c.autoMatched };
    save(c.id, () => mapClass(c.id, key), {
      message: mapsToMessage(c.fqn, nameOfKey(key)),
      undo: () => save(c.id, () => restoreClassMapping(c.id, before)),
    });
  }

  // The Auto badge says what it matched in plain words; one it can't name keeps the badge alone.
  const badges = (c: ClassRow) => {
    const matched = c.propertyId ? properties.find((p) => p.id === c.propertyId) : undefined;
    return (
      <>
        {c.role === "UNMAPPED" && <Badge tone="warn">Needs mapping</Badge>}
        {c.autoMatched &&
          c.role !== "UNMAPPED" &&
          (matched ? (
            <Tooltip label={`Matched to ${matched.label} by address`}>
              <Badge>Auto</Badge>
            </Tooltip>
          ) : (
            <Badge>Auto</Badge>
          ))}
      </>
    );
  };

  return (
    // Below sm each class is a block: its name and badge, then the pick at full width under it, so a long
    // property name isn't squeezed beside a wrapping class name (a table cell's width follows its text).
    <Table className={cn(flushTable, "max-sm:block")}>
      <thead className="max-sm:sr-only">
        <tr>
          <Th>Class</Th>
          <Th>Maps to</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line max-sm:block">
        {classes.map((c) => {
          const key = mapsToKey(targetOf(c));
          const saving = busy.has(c.id);
          return (
            <tr
              key={c.id}
              aria-busy={saving || undefined}
              className={cn("transition-opacity duration-fast max-sm:block max-sm:py-2", saving ? "opacity-50" : "hover:bg-fill-1")}
            >
              <Td className={cn(cell, "max-sm:block max-sm:pb-0")}>
                <span className="mr-2 [overflow-wrap:anywhere]">{c.fqn}</span>
                {badges(c)}
              </Td>
              <Td className={cn(cell, "max-sm:block max-sm:pl-0 max-sm:pt-0 sm:w-80")}>
                <Select
                  aria-label={`Maps to for ${c.fqn}`}
                  title={`${classLeaf(c.fqn)} maps to`}
                  size="sm"
                  emptyLabel={ROLE_LABELS.UNMAPPED}
                  sections={key === "ENTITY" ? [...sections, { id: "stray", items: [{ id: "ENTITY", label: ROLE_LABELS.ENTITY, isDisabled: true }] }] : sections}
                  searchLabel="Search"
                  value={key}
                  onChange={(next) => mapsTo(c, next)}
                />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

type AccountRow = {
  id: string;
  fqn: string;
  acctType: string;
  classification: string;
  category: string;
  locked: boolean;
};

/**
 * Every account's category, with a search over the account, its type and its
 * category ("util" finds the utilities). The category is a `Select` with its
 * own search from 10 options; picking one saves where the row stands, only
 * that row dimming.
 */
export function AccountCategoryTable({ accounts }: { accounts: AccountRow[] }) {
  const { busy, save } = useRowSaves();
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => accounts.filter((a) => matchesSearch(q, a.fqn, a.acctType, a.classification, CATEGORY_LABELS[a.category])),
    [accounts, q],
  );

  return (
    <>
      <SearchInput placeholder="Search accounts" value={q} onChange={setQ} className="mb-3 max-w-xs" />
      {shown.length === 0 ? (
        <EmptyState
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setQ("")}>
              Clear search
            </Button>
          }
        >
          No accounts match “{q.trim()}”.
        </EmptyState>
      ) : (
        // Below sm each account is a block: its name, with the type under it, then the pick at full width, so a
        // long account name isn't squeezed beside a 212px select (a table cell's width follows its text).
        <Table className={cn(flushTable, "max-sm:block")}>
          <thead className="max-sm:sr-only">
            <tr>
              <Th>Account</Th>
              <Th className="max-sm:hidden">Type</Th>
              <Th>Category</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line max-sm:block">
            {shown.map((a) => {
              const saving = busy.has(a.id);
              return (
                <tr
                  key={a.id}
                  aria-busy={saving || undefined}
                  className={cn("transition-opacity duration-fast max-sm:block max-sm:py-2", saving ? "opacity-50" : "hover:bg-fill-1")}
                >
                  <Td className={cn(cell, "max-sm:block max-sm:pb-0")}>
                    <span className="inline-flex items-center gap-1.5 [overflow-wrap:anywhere]">
                      {a.fqn}
                      {a.locked && (
                        <Tooltip label="Category set by you">
                          <Lock role="img" aria-label="Category set by you" className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                        </Tooltip>
                      )}
                    </span>
                    <span className="block text-meta text-fg-3 sm:hidden">{a.acctType || a.classification}</span>
                  </Td>
                  <Td className={cn(cell, "text-fg-2 max-sm:hidden")}>{a.acctType || a.classification}</Td>
                  <Td className={cn(cell, "max-sm:block max-sm:pl-0 max-sm:pt-0 sm:w-72")}>
                    <Select
                      aria-label={`Category of ${a.fqn}`}
                      title="Category"
                      size="sm"
                      searchLabel="Search categories"
                      items={CATEGORY_ITEMS}
                      value={a.category}
                      onChange={(category) => category && category !== a.category && save(a.id, () => setAccountCategory(a.id, category))}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
