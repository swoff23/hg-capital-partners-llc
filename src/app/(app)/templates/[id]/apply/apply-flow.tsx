"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { ActionBar, actionBarButton } from "@/components/action-bar";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateField } from "@/components/date-field";
import { DatePicker } from "@/components/due-date-picker";
import { AssigneePicker, PropertyPicker, UnitPicker } from "@/components/entity-picker";
import { useHoldLeave } from "@/components/leave-guard";
import { useToast } from "@/components/toast";
import { useDraft, useRestoredDraft } from "@/components/use-draft";
import { useInlineEditKeys } from "@/components/use-inline-edit-keys";
import { useRun } from "@/components/use-run";
import { Button, Checkbox, FieldRow, FormField, Input, PickField, SaveError, Section, TextLink } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { stableJson } from "@/lib/drafts";
import { inlineEditCommit } from "@/lib/inline-edit";
import { offersUnits, type PropertyOption } from "@/lib/picker-options-shape";
import {
  appliedLeaseLine,
  applyDraftKey,
  applyProblems,
  applyTokens,
  createLeaseLabel,
  createTasksLabel,
  dueFromOffset,
  extractTokens,
  fillInValue,
  fillNotes,
  hasApplyProblems,
  homeResolves,
  isAddressToken,
  isTenantNameToken,
  isTenantPhoneToken,
  leaseWhere,
  moveOutLabel,
  notesOnlyTokens,
  playbookKind,
  prefillHousehold,
  rowTitle,
  sameToken,
  tasksToCreate,
  tokenInputType,
  tokenLabel,
  UNTICK_LEASE,
  UNTICK_LEASE_SHORT,
  type HomeTenants,
  type PlaybookLease,
  type TemplateItem,
} from "@/lib/tasks/template-items";
import { cn } from "@/lib/utils";
import { applyPlaybook, homeTenants } from "../../actions";

type Row = {
  include: boolean;
  /** Set once the title is renamed by hand. Tokens still fill any [Token] the rename kept. */
  title?: string;
  assignee: AssigneeValue;
  /** Set once the date is picked by hand; the anchor date stops moving it. */
  due?: Ymd | null;
};

/** Everything the page holds that isn't saved yet: one JSON value, so it is the dirty compare and the draft. */
type State = {
  propertyId: string;
  unitLabel: string | null;
  anchor: Ymd | null;
  typed: Record<string, string>;
  rows: Row[];
  /** The lease box (docs/specs/tenants.md section 9), ticked by default; kept in the draft so a restore doesn't tick it again. */
  saveLease: boolean;
};

/**
 * Apply a playbook (D28; forms 4.5): property and unit, the anchor date and
 * the fill-ins ([Tenant]; [Address] fills from the property and has no
 * field), then the tasks as read-only rows (untick, tap a title to rename,
 * reassign, redate), then Create. The bar at the bottom reads "39 tasks to
 * create" beside the primary "Create 39 tasks" and is always there; it stays
 * enabled, and what's missing shows only after it's pressed (BPLAY-011),
 * on the field that needs it. What's typed is a draft: it holds the
 * LeaveGuard, comes back after a reload ("Your unsaved changes are back"),
 * and a refresh never replaces it. Success goes to the new tasks.
 *
 * Tenants (docs/specs/tenants.md section 9): on any playbook but a move-in
 * one, [Tenant] and a tenant phone prefill from the household living in the
 * picked home. A move-in playbook offers a box that creates the upcoming
 * lease, a move-out one a box that sets the household's Moves out; Apply
 * writes it with the tasks, all or nothing.
 */
export function ApplyFlow({
  templateId,
  templateName,
  anchorLabel,
  items,
  properties,
  stillOpen,
  initialPropertyId,
  users,
  contractors,
  recent,
  meId,
  today,
}: {
  templateId: string;
  templateName: string;
  anchorLabel: string;
  items: TemplateItem[];
  properties: PropertyOption[];
  /** Tasks from this playbook still open on each building, by property id. */
  stillOpen: Record<string, number>;
  initialPropertyId: string | null;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  recent: AssigneeValue[];
  meId: string;
  today: Ymd;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, pending, error: refusal, fieldErrors, reset: forgetRefusal } = useRun();
  const kind = playbookKind(anchorLabel);
  const leaseErrorId = useId();

  const [initial] = useState<State>(() => ({
    propertyId: initialPropertyId ?? "",
    unitLabel: null,
    anchor: today,
    typed: {},
    rows: items.map((i) => ({ include: true, assignee: initialAssignee(i, users, contractors) })),
    saveLease: true,
  }));
  const [s, setS] = useState<State>(initial);
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const form = useRef<HTMLDivElement>(null);

  // The draft: kept in this browser per playbook version and per building the page was opened for, put back after a reload.
  const { restored, clear: clearDraft } = useDraft(applyDraftKey(meId, templateId, items, initialPropertyId), s);
  const baseline = stableJson(initial);
  const dirty = stableJson(s) !== baseline;
  useHoldLeave(dirty ? { title: "Leave before creating tasks?", stay: "Keep editing" } : null);

  function discard() {
    clearDraft();
    setS(initial);
    setTried(false);
    forgetRefusal();
  }

  // A draft for a playbook with different tasks was dropped with its version key; the length check is a safety net.
  // A draft saved before the lease box keeps the box's default.
  useRestoredDraft(restored, { accept: (d) => d.rows.length === items.length, apply: (d) => setS({ ...d, saveLease: d.saveLease ?? true }), discard });

  // Any edit lets go of a refusal: it was about what was there before.
  const patch = (p: Partial<State>) => {
    forgetRefusal();
    setS((cur) => ({ ...cur, ...p }));
  };
  const patchRow = (i: number, p: Partial<Row>) => {
    forgetRefusal();
    setS((cur) => ({ ...cur, rows: cur.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  };

  const property = properties.find((p) => p.id === s.propertyId);

  // Who lives in the picked home today, asked again on each pick that names one household (a unit, or a building
  // with one), the restored draft's included. Held with the home it answers for, so a stale answer never prefills.
  // A move-in playbook's tenants are new, so it never asks.
  const askProperty = kind !== "move-in" && property && homeResolves(property.units, s.unitLabel) ? property.id : null;
  const askUnit = askProperty ? s.unitLabel : null;
  const askedHome = askProperty ? `${askProperty}|${askUnit ?? ""}` : null;
  const [living, setLiving] = useState<{ home: string; tenants: HomeTenants | null } | null>(null);
  useEffect(() => {
    if (!askProperty) return;
    const asked = `${askProperty}|${askUnit ?? ""}`;
    let live = true;
    homeTenants(askProperty, askUnit).then(
      (tenants) => live && setLiving({ home: asked, tenants }),
      // Unanswered (offline, signed out): nothing prefills, and there's no move-out box.
      () => live && setLiving({ home: asked, tenants: null }),
    );
    return () => {
      live = false;
    };
  }, [askProperty, askUnit]);
  const household = askedHome !== null && living?.home === askedHome ? living.tenants : null;

  const tokens = extractTokens(items.flatMap((i) => [i.title, i.notes, ...(i.checklist ?? [])]));
  // [Address] fills from the property, so it has no field of its own (G1C-I08).
  const fillIns = tokens.filter((t) => !isAddressToken(t));
  // Used only in notes (tenant email, number): left blank, their line drops from the notes.
  const optional = notesOnlyTokens(items);
  const isOptional = (token: string) => optional.some((o) => sameToken(o, token));
  // What's typed, else a computed default ([Address], the household's names and phone) that never lands in `typed`.
  const defaults = { address: property?.label, household: prefillHousehold(kind, household) };
  const valueOf = (token: string) => fillInValue(token, s.typed, defaults);
  const values = Object.fromEntries(tokens.map((t) => [t, valueOf(t)]));
  const usesAnchor = items.some((i) => i.dueOffsetDays !== undefined);

  // The lease box: on a move-in playbook once the home names one household and the tenant's name is filled in (a lease
  // doesn't need a phone, tenants.md call 2); on a move-out one while a household lives there. The date is the playbook's.
  const leaseDay = usesAnchor ? s.anchor : null;
  const nameToken = fillIns.find(isTenantNameToken);
  const phoneToken = fillIns.find(isTenantPhoneToken);
  let leaseOffer: { label: string; plan: PlaybookLease } | null = null;
  if (property && leaseDay && kind === "move-in" && nameToken && homeResolves(property.units, s.unitLabel)) {
    const name = valueOf(nameToken).trim();
    const phone = phoneToken ? valueOf(phoneToken).trim() : "";
    if (name) {
      leaseOffer = {
        label: createLeaseLabel(name, leaseWhere(property.label, s.unitLabel), leaseDay, today),
        plan: { kind, name, phone: phone || null, on: leaseDay },
      };
    }
  } else if (property && leaseDay && kind === "move-out" && household) {
    leaseOffer = { label: moveOutLabel(household.names, leaseDay, today), plan: { kind, on: leaseDay } };
  }
  // A refused lease write shows under the box, which is where the way through is.
  const leaseError = leaseOffer ? fieldErrors?.lease : undefined;

  const titleOf = (i: number) => rowTitle(s.rows[i].title, items[i].title, values);
  const notesOf = (i: number) => fillNotes(items[i].notes, values, optional);
  const checklistOf = (i: number) => (items[i].checklist ?? []).map((c) => applyTokens(c, values));
  const dueOf = (i: number) => (s.rows[i].due !== undefined ? s.rows[i].due : dueFromOffset(s.anchor, items[i].dueOffsetDays));
  const kept = s.rows.map((r, i) => (r.include && titleOf(i).trim().length >= 2 ? i : -1)).filter((i) => i >= 0);
  const count = kept.length;

  // A [Token] still blank in a task that will be created. The ones with a field name it; one typed into a title by hand has none.
  const open = extractTokens(kept.flatMap((i) => [titleOf(i), notesOf(i), ...checklistOf(i)]));
  const openFields = open.flatMap((t) => {
    const field = fillIns.find((f) => sameToken(f, t));
    return field ? [field] : [];
  });
  const stray = open.find((t) => !isAddressToken(t) && !fillIns.some((f) => sameToken(f, t)));
  const problems = applyProblems({ propertyId: s.propertyId, count, open: openFields });
  const blocked = hasApplyProblems(problems) || stray !== undefined;
  // The line above the primary: the refusal from the server (unless it's the lease's, shown under its box), or the
  // list's problem once Create was pressed.
  const barLine =
    (leaseError ? undefined : refusal) ?? (tried ? (problems.tasks ?? (stray ? `Replace [${stray}] in a task's title, or untick it.` : undefined)) : undefined);

  // After a press with something missing, focus goes to the first field that needs it (forms 2.0, Timing).
  useEffect(() => {
    if (focusTick === 0) return;
    const first = form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] button, [data-invalid="true"] input');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "center" });
  }, [focusTick]);

  function create() {
    if (pending) return;
    setTried(true);
    if (blocked) {
      setFocusTick((n) => n + 1);
      return;
    }
    run(
      () =>
        applyPlaybook(templateId, {
          propertyId: s.propertyId,
          unitLabel: s.unitLabel,
          rows: kept.map((i) => ({
            title: titleOf(i).trim(),
            notes: notesOf(i),
            assignee: s.rows[i].assignee,
            dueDate: dueOf(i),
            checklist: checklistOf(i),
          })),
          lease: leaseOffer && s.saveLease ? leaseOffer.plan : null,
        }),
      {
        failure: "inline",
        // A refused lease marks its box: focus goes there, as it does to a field that needs something.
        failed: () => setFocusTick((n) => n + 1),
        succeeded: (done) => {
          clearDraft();
          // The new tasks are the next step: the list opens on them, with what happened said once, and what
          // happened to the lease as the toast's second clause, which a phone cuts first.
          toast({
            message: `${done.count} ${done.count === 1 ? "task" : "tasks"} created for ${property?.label ?? "the property"}`,
            ...(done.lease ? { detail: appliedLeaseLine(done.lease, today) } : {}),
          });
          router.push(`/tasks?property=${encodeURIComponent(done.propertyId)}`);
        },
      },
    );
  }

  const open_ = property ? (stillOpen[property.id] ?? 0) : 0;
  const allTicked = s.rows.every((r) => r.include);

  return (
    <div ref={form} className="space-y-8 pointer-coarse:space-y-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <PickField label="Property" error={tried ? problems.property : undefined}>
            <PropertyPicker
              value={s.propertyId || null}
              properties={properties}
              required
              trigger="field"
              className={tried && problems.property ? "border-destructive" : undefined}
              onChange={(id) => {
                const next = properties.find((p) => p.id === id);
                patch({
                  propertyId: id ?? "",
                  unitLabel: s.unitLabel && next?.units.includes(s.unitLabel) ? s.unitLabel : null,
                });
              }}
            />
          </PickField>
          {property && offersUnits(property.units, s.unitLabel) && (
            <PickField label="Unit">
              <UnitPicker value={s.unitLabel} units={property.units} trigger="field" onChange={(unitLabel) => patch({ unitLabel })} />
            </PickField>
          )}
        </div>

        {property && open_ > 0 && (
          // Neutral: nothing is wrong, it may be exactly what's wanted (BPLAY-V01).
          <p className="truncate text-meta text-muted-foreground">
            {open_} {open_ === 1 ? "task from this playbook is" : "tasks from this playbook are"} still open here.{" "}
            <TextLink href={`/tasks?property=${encodeURIComponent(property.id)}`}>Open {open_ === 1 ? "it" : "them"}</TextLink>
          </p>
        )}

        {usesAnchor && (
          <div className="flex flex-col gap-1.5 sm:max-w-[calc(50%-0.5rem)]">
            <span className="text-meta font-medium text-fg-2">{anchorLabel}</span>
            <DateField label={anchorLabel} placeholder="Pick a date" value={s.anchor} today={today} allowNone={false} onChange={(anchor) => patch({ anchor })} />
          </div>
        )}

        {fillIns.length > 0 && (
          <FieldRow>
            {fillIns.map((t) => (
              <FormField key={t} label={tokenLabel(t)} optional={isOptional(t)} error={tried ? problems.tokens[t] : undefined}>
                {(p) => (
                  <Input
                    {...p}
                    type={tokenInputType(t)}
                    value={valueOf(t)}
                    autoComplete="off"
                    onChange={(e) => patch({ typed: { ...s.typed, [t]: e.target.value } })}
                  />
                )}
              </FormField>
            ))}
          </FieldRow>
        )}

        {leaseOffer && (
          // Full width under the fill-ins at every size; on a narrow phone the label may take a second line.
          <div data-invalid={leaseError ? "true" : undefined} className="space-y-1">
            <label className="relative flex w-fit cursor-pointer items-start gap-2 text-body text-foreground pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3">
              {/* As tall as the label's first line, so the box sits on it when the label wraps. */}
              <span className="flex h-lh shrink-0 items-center">
                <Checkbox
                  checked={s.saveLease}
                  aria-invalid={leaseError ? true : undefined}
                  aria-describedby={leaseError ? leaseErrorId : undefined}
                  onChange={(e) => patch({ saveLease: e.target.checked })}
                />
              </span>
              <span className="min-w-0">{leaseOffer.label}</span>
            </label>
            {leaseError && (
              // One line at every width: the refusal truncates and the way through after it never does, short on a phone.
              <SaveError
                id={leaseErrorId}
                className="pl-6"
                action={
                  <>
                    <span className="sm:hidden">{UNTICK_LEASE_SHORT}</span>
                    <span className="hidden sm:inline">{UNTICK_LEASE}</span>
                  </>
                }
              >
                {leaseError}
              </SaveError>
            )}
          </div>
        )}
      </div>

      <Section
        title="Tasks"
        actions={
          <>
            <span className="text-meta tabular-nums text-muted-foreground">
              {count} of {items.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setS((cur) => ({ ...cur, rows: cur.rows.map((r) => ({ ...r, include: !allTicked })) }))}
            >
              {allTicked ? "Untick all" : "Tick all"}
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-border">
          {items.map((item, i) => {
            const r = s.rows[i];
            const title = titleOf(i);
            return (
              <li
                key={i}
                // One line from md: tick, title, the two chips at the right edge. Below it the chips go under the title.
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center",
                  !r.include && "opacity-50",
                )}
              >
                {/* As tall as the title's first line, so the box sits on it; the label reaches 10px past the box for a 44px target on touch. */}
                <label className="relative flex h-7 w-4 shrink-0 cursor-pointer items-center justify-center after:absolute after:inset-y-0 after:-inset-x-3 pointer-coarse:h-11">
                  <Checkbox checked={r.include} onChange={(e) => patchRow(i, { include: e.target.checked })} aria-label={`Include ${title}`} />
                </label>
                <RowTitle
                  value={title}
                  disabled={!r.include}
                  onRename={(next) => patchRow(i, { title: next })}
                  note={item.checklist && item.checklist.length > 0 ? `${item.checklist.length} checklist ${item.checklist.length === 1 ? "item" : "items"}` : null}
                />
                <div className="col-start-2 flex min-w-0 items-center gap-2 md:col-start-3">
                  <AssigneePicker
                    value={r.assignee}
                    users={users}
                    contractors={contractors}
                    meId={meId}
                    recent={recent}
                    subject={title}
                    isDisabled={!r.include}
                    onChange={(assignee) => patchRow(i, { assignee })}
                  />
                  <DatePicker variant="row" value={dueOf(i)} today={today} subject={title} isDisabled={!r.include} onChange={(due) => patchRow(i, { due })} />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <ActionBar
        placement="app"
        contentClassName="box-content max-w-3xl"
        status={
          <>
            <span className="max-sm:hidden">{tasksToCreate(count)}</span>
            <span className="sm:hidden">{count} to create</span>
          </>
        }
        error={barLine && <SaveError className="truncate">{barLine}</SaveError>}
        onPrimary={create}
        secondary={
          dirty && (
            <Button type="button" variant="secondary" className={actionBarButton} onClick={() => setAsking(true)} disabled={pending}>
              Discard
            </Button>
          )
        }
        primary={
          <Button type="button" className={actionBarButton} pending={pending} onClick={create} aria-keyshortcuts="Meta+Enter Control+Enter">
            {createTasksLabel(count)}
          </Button>
        }
      />

      {asking && (
        <ConfirmDialog
          title={`Discard your changes to ${templateName}?`}
          cancelLabel="Keep editing"
          onClose={() => setAsking(false)}
          actions={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setAsking(false);
                discard();
              }}
            >
              Discard changes
            </Button>
          }
        />
      )}
    </div>
  );
}

/**
 * A task's title as text, with what it will be called once the fill-ins are
 * in (BPLAY-007); a click or tap renames it in place, Enter or leaving the
 * field keeps the rename, Esc puts it back. A title under 2 characters says so
 * and stays open rather than reverting without a word.
 */
function RowTitle({ value, disabled, onRename, note }: { value: string; disabled: boolean; onRename: (title: string) => void; note: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [short, setShort] = useState(false);
  const keys = useInlineEditKeys(
    () => {
      setDraft(value);
      setShort(false);
      setEditing(false);
    },
    () => {
      const next = inlineEditCommit(draft, value, 1);
      if (next === null) {
        setDraft(value);
        setShort(false);
        setEditing(false);
        return;
      }
      if (next.length < 2) {
        setShort(true);
        return;
      }
      setShort(false);
      setEditing(false);
      onRename(next);
    },
  );

  if (editing) {
    return (
      <div className="min-w-0 space-y-1">
        <Input
          aria-label="Task title"
          aria-invalid={short || undefined}
          value={draft}
          autoFocus
          size="sm"
          maxLength={300}
          onChange={(e) => {
            setDraft(e.target.value);
            setShort(false);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={keys.onBlur}
          onKeyDown={keys.onKeyDown}
        />
        {short && <p className="truncate text-meta text-destructive">Enter at least 2 characters.</p>}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="-mx-1.5 flex min-h-7 min-w-0 items-center rounded-sm px-1.5 text-left text-body text-foreground transition-colors [overflow-wrap:anywhere] not-disabled:hover:bg-muted pointer-coarse:min-h-11"
    >
      {value}
      {note && <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-meta text-muted-foreground max-md:hidden"><ListChecks aria-hidden="true" className="size-3.5" />{note}</span>}
    </button>
  );
}

/** The playbook's assignee when that person is still here; otherwise nobody. */
function initialAssignee(item: TemplateItem, users: AssigneeUser[], contractors: AssigneeContractor[]): AssigneeValue {
  if (item.assigneeUserId && users.some((u) => u.id === item.assigneeUserId)) return { userId: item.assigneeUserId };
  if (item.assigneeContactId && contractors.some((c) => c.id === item.assigneeContactId)) return { contactId: item.assigneeContactId };
  return null;
}
