"use client";
import { useState, useTransition } from "react";
import { ListChecks } from "lucide-react";
import { AssigneePicker, type AssigneeContractor, type AssigneeUser, type AssigneeValue } from "@/components/assignee-picker";
import { DueDatePicker } from "@/components/due-date-picker";
import { Button, Card, CardBody, CardHeader, CardTitle, Input, Select } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import {
  applyTokens,
  dueFromOffset,
  extractTokens,
  fillNotes,
  hasOpenTokens,
  isAddressToken,
  notesOnlyTokens,
  rowTitle,
  sameToken,
  tokenInputType,
  tokenLabel,
  type TemplateItem,
} from "@/lib/tasks/template-items";
import { cn } from "@/lib/utils";
import { applyPlaybook } from "../../actions";

type Row = {
  include: boolean;
  /** Set once the title is edited by hand. Tokens still fill any [Token] the edit kept. */
  title?: string;
  assignee: AssigneeValue;
  /** Set once the date is picked by hand; the anchor date stops moving it. */
  due?: Ymd | null;
};

/**
 * Apply a playbook (D28): pick the property, the anchor date and the token
 * values ([Tenant]; [Address] fills from the property), review the tasks
 * (untick, rename, reassign, redate), then create them all at once.
 */
export function ApplyFlow({
  templateId,
  anchorLabel,
  items,
  properties,
  initialPropertyId,
  users,
  contractors,
  today,
}: {
  templateId: string;
  anchorLabel: string;
  items: TemplateItem[];
  properties: { id: string; label: string }[];
  initialPropertyId: string | null;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  today: Ymd;
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [anchor, setAnchor] = useState<Ymd | null>(today);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((i) => ({ include: true, assignee: initialAssignee(i, users, contractors) })),
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const property = properties.find((p) => p.id === propertyId);
  const tokens = extractTokens(items.flatMap((i) => [i.title, i.notes, ...(i.checklist ?? [])]));
  // Used only in notes (tenant email, number): left blank, their line drops from the notes.
  const optional = notesOnlyTokens(items);
  const isOptional = (token: string) => optional.some((o) => sameToken(o, token));
  const valueOf = (token: string) => typed[token] ?? (isAddressToken(token) && property ? property.label : "");
  const values = Object.fromEntries(tokens.map((t) => [t, valueOf(t)]));
  const usesAnchor = items.some((i) => i.dueOffsetDays !== undefined);

  const titleOf = (i: number) => rowTitle(rows[i].title, items[i].title, values);
  const notesOf = (i: number) => fillNotes(items[i].notes, values, optional);
  const checklistOf = (i: number) => (items[i].checklist ?? []).map((c) => applyTokens(c, values));
  const dueOf = (i: number) => (rows[i].due !== undefined ? rows[i].due : dueFromOffset(anchor, items[i].dueOffsetDays));
  const kept = rows.map((r, i) => (r.include && titleOf(i).trim().length >= 2 ? i : -1)).filter((i) => i >= 0);
  const count = kept.length;
  // A [Token] still blank in a task that will be created: fill it (or edit the title) first.
  const open = extractTokens(kept.flatMap((i) => [titleOf(i), notesOf(i), ...checklistOf(i)]));
  // Named as its field reads; brackets typed into a title have no field, so they show as typed.
  const openField = open.length > 0 ? tokens.find((t) => sameToken(t, open[0])) : undefined;
  const hint = !error && propertyId && open.length > 0 ? `Fill in ${openField ? tokenLabel(openField) : `[${open[0]}]`} first` : "";

  const patchRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function submit() {
    setError("");
    if (!propertyId) return setError("Pick a property.");
    start(async () => {
      const res = await callAction(() =>
        applyPlaybook(templateId, {
          propertyId,
          rows: kept.map((i) => ({
            title: titleOf(i).trim(),
            notes: notesOf(i),
            assignee: rows[i].assignee,
            dueDate: dueOf(i),
            checklist: checklistOf(i),
          })),
        }),
      );
      // Success redirects to the task list (callAction lets it through); only a refusal comes back.
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted">Property</span>
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="mt-1" required>
                <option value="">Pick a property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
            {usesAnchor && (
              <div>
                <span className="text-xs font-medium text-muted">{anchorLabel}</span>
                <div className="mt-1 flex h-9 items-center pointer-coarse:h-11">
                  <DueDatePicker label={anchorLabel} placeholder="Pick a date" value={anchor} today={today} onChange={setAnchor} />
                </div>
              </div>
            )}
          </div>
          {tokens.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {tokens.map((t) => (
                <label key={t} className="block">
                  <span className="text-xs font-medium text-muted">
                    {tokenLabel(t)}
                    {isOptional(t) && <span className="ml-2 font-normal">{" (optional)"}</span>}
                  </span>
                  <Input
                    type={tokenInputType(t)}
                    value={valueOf(t)}
                    placeholder={isAddressToken(t) ? "Fills from the property" : `Fill in [${t}]`}
                    onChange={(e) => setTyped((v) => ({ ...v, [t]: e.target.value }))}
                    className="mt-1"
                  />
                </label>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>Tasks</CardTitle>
          <span className="text-xs tabular-nums text-muted">
            {count} of {items.length}
          </span>
        </CardHeader>
        <ul className="divide-y divide-border">
          {items.map((item, i) => {
            const r = rows[i];
            return (
              <li key={i} className={cn("flex items-start gap-3 px-4 py-3", !r.include && "opacity-60")}>
                <label className="-m-2.5 flex shrink-0 cursor-pointer items-center justify-center p-2.5 pointer-coarse:-m-3.5 pointer-coarse:p-3.5">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => patchRow(i, { include: e.target.checked })}
                    aria-label={`Include ${titleOf(i)}`}
                    className="mt-2.5 h-4 w-4 accent-[var(--primary)] pointer-coarse:mt-3.5"
                  />
                </label>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    aria-label="Task title"
                    value={titleOf(i)}
                    disabled={!r.include}
                    aria-invalid={r.include && !!propertyId && hasOpenTokens(titleOf(i))}
                    onChange={(e) => patchRow(i, { title: e.target.value })}
                    className="aria-invalid:border-red-300 dark:aria-invalid:border-red-900"
                  />
                  <div className="-my-2 flex items-center gap-2 overflow-x-auto py-2 [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden">
                    <AssigneePicker
                      value={r.assignee}
                      users={users}
                      contractors={contractors}
                      isDisabled={!r.include}
                      onChange={(assignee) => patchRow(i, { assignee })}
                    />
                    <DueDatePicker
                      value={dueOf(i)}
                      today={today}
                      isDisabled={!r.include}
                      onChange={(due) => patchRow(i, { due })}
                    />
                    {item.checklist && item.checklist.length > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        {item.checklist.length} checklist {item.checklist.length === 1 ? "item" : "items"}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {(error || hint) && <p className="min-w-0 truncate text-xs text-red-600 dark:text-red-400">{error || hint}</p>}
        <Button type="button" onClick={submit} disabled={pending || !propertyId || count === 0 || open.length > 0} className="shrink-0">
          {pending ? "Creating…" : `Create ${count} ${count === 1 ? "task" : "tasks"}`}
        </Button>
      </div>
    </div>
  );
}

/** The playbook's assignee when that person is still here; otherwise nobody. */
function initialAssignee(item: TemplateItem, users: AssigneeUser[], contractors: AssigneeContractor[]): AssigneeValue {
  if (item.assigneeUserId && users.some((u) => u.id === item.assigneeUserId)) return { userId: item.assigneeUserId };
  if (item.assigneeContactId && contractors.some((c) => c.id === item.assigneeContactId)) return { contactId: item.assigneeContactId };
  return null;
}
