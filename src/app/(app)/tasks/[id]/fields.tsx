"use client";
import { useOptimistic, type ReactNode } from "react";
import Link from "next/link";
import { Button as AriaButton } from "react-aria-components";
import { KeyRound, MessageSquareText, Phone, Repeat } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { DatePicker } from "@/components/due-date-picker";
import { Code } from "@/components/code";
import { AssigneePicker, PropertyPicker, UnitPicker } from "@/components/entity-picker";
import { Menu, MenuHeader, MenuItem, MenuSection, MenuSeparator, MenuTrigger } from "@/components/menu";
import { Switch } from "@/components/switch";
import { buttonClass, pickerChipClass, tagClass } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { telHref, textHref } from "@/lib/contacts";
import { useRun } from "@/components/use-run";
import type { Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { offersUnits, unitAfterMove, unitDisplay, type PropertyOption } from "@/lib/picker-options-shape";
import { fmtShortDay } from "@/lib/tasks/activity";
import { describeRepeat, repeatDue, type RepeatRule } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";
import { updateTask } from "./actions";

export type { PropertyOption };

/**
 * The Lockbox row: the code this job resolves to, or a nudge to pick a unit when the property has several.
 * `contractorSees`: their job shows it (a vacant home, or Permission to enter), so the Tag says so.
 */
export type TaskLockbox =
  | { state: "shown"; code: string; contractor: string; hasLogin: boolean; contractorSees: boolean }
  | { state: "pick-unit"; contractor: string; hasLogin: boolean };

/** One tenant as the Tenants row shows them: the number as typed, and the clean one Call and Text dial. */
export type TaskTenant = { name: string; phone: string | null; dial: string | null };

/**
 * The Tenants row (docs/specs/tenants.md section 8): the household living there today, or with nobody there the
 * one moving in next. `moveLine` is "Moves out Jan 31" or "Moves in Feb 1", when that date is set.
 */
export type TaskTenants = { leaseId: string; people: TaskTenant[]; moveLine: string | null };

/** A resident's request (docs/specs/maintenance-requests.md, section 4.1): who sent it, and their pets answer after a Yes. */
export type TaskResident = { leaseId: string; tenantName: string; pets: boolean | null; petsNote: string | null };

export interface TaskFieldValues {
  assignee: AssigneeValue;
  dueDate: Ymd | null;
  scheduledFor: Ymd | null;
  propertyId: string | null;
  unitLabel: string | null;
  repeatRule: RepeatRule | null;
  /** Permission to enter, as it holds for the household there now (lockbox.ts accessState). */
  entryPermitted: boolean;
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * The task's fields: a sticky rail of label and chip rows on a computer
 * (lg up), a row of chips under the title below that, scrolling sideways on
 * a phone. One set of controls; CSS moves them. In the rail, rows sit flat on
 * hairlines with a 112px label column (docs/brand-guidelines.md, section 5);
 * the page puts the Details heading over them.
 *
 * Every pick saves at once, shows the new value, and toasts what changed with
 * Undo (docs/specs/selectors.md 2, Commit and feedback). Repeat lives inside
 * the due date's panel; the rail keeps a read-only line of what repeats.
 */
export function TaskFields({
  taskId,
  today,
  status,
  overdue,
  values,
  users,
  contractors,
  properties,
  meId,
  recent,
  repeatSlot,
  lockbox,
  tenants,
  entryOffered,
  resident = null,
  created,
  className,
}: {
  taskId: string;
  today: Ymd;
  status: TaskStatus;
  overdue: boolean;
  values: TaskFieldValues;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  properties: PropertyOption[];
  /** The signed-in user: first in Team, "(you)", and short names below sm. */
  meId: string;
  /** The people the viewer assigned last, for the picker's Recent rows. */
  recent: AssigneeValue[];
  /** The date the series gave this task when it is a repeat copy, null for a series' first task: the repeat menu's "Next:" steps from it. */
  repeatSlot: Ymd | null;
  /** Set when a contractor is assigned and the property has lockbox codes (D21); `code` is the one this job resolves to. */
  lockbox: TaskLockbox | null;
  /** Who lives there, whenever a household is on file for this job's home. */
  tenants: TaskTenants | null;
  /** The Permission to enter switch: an open task at a home somebody lives in, whoever it's assigned to (tenants.md T10). */
  entryOffered: boolean;
  /** Set when a resident sent it: the Pets and Requested by rows (drawing 13 A). */
  resident?: TaskResident | null;
  created: string;
  className?: string;
}) {
  const { run } = useRun();
  const [v, setOptimistic] = useOptimistic(values, (cur, patch: Partial<TaskFieldValues>) => ({ ...cur, ...patch }));
  const property = properties.find((p) => p.id === v.propertyId);

  /** Saves a patch at once and toasts it with Undo; the toast's `key` makes a quick second edit replace it. */
  function save(
    patch: Partial<TaskFieldValues>,
    opts: { done: string; detail?: string; field: string; undo: Partial<TaskFieldValues> },
  ) {
    run(() => updateTask(taskId, patch), {
      before: () => setOptimistic(patch),
      done: opts.done,
      detail: opts.detail,
      key: `task:${taskId}:${opts.field}`,
      undo: () => updateTask(taskId, opts.undo),
    });
  }

  const nameOf = (a: AssigneeValue): string | null => {
    if (!a) return null;
    if ("userId" in a) {
      if (a.userId === meId) return "you";
      const u = users.find((x) => x.id === a.userId);
      return u ? (u.name || u.email).split(/\s+/)[0] : null;
    }
    const c = contractors.find((x) => x.id === a.contactId);
    return c ? c.name.split(/\s+/)[0] : null;
  };

  function assign(assignee: AssigneeValue) {
    const name = nameOf(assignee);
    run(
      // Sends the assignee this chip showed, so a reassignment from a stale
      // page is refused instead of taking the job off whoever has it now.
      () => updateTask(taskId, { assignee, expectedAssignee: v.assignee }),
      {
        before: () => setOptimistic({ assignee }),
        done: name ? `Assigned to ${name}` : "Unassigned",
        key: `task:${taskId}:assignee`,
        undo: () => updateTask(taskId, { assignee: v.assignee, expectedAssignee: assignee }),
      },
    );
  }

  function changeProperty(propertyId: string | null) {
    const next = properties.find((p) => p.id === propertyId);
    const keepUnit = !!v.unitLabel && unitAfterMove(v.unitLabel, next?.units ?? []) !== null;
    const dropsUnit = !!v.unitLabel && !keepUnit;
    save(
      { propertyId, ...(keepUnit ? {} : { unitLabel: null }) },
      {
        done: next ? `Property set to ${next.label}` : "Property removed",
        detail: dropsUnit ? "Unit cleared" : undefined,
        field: "property",
        undo: { propertyId: v.propertyId, unitLabel: v.unitLabel },
      },
    );
  }

  const from = v.dueDate ?? today;

  // Permission to enter (tenants.md section 8): on stamps the server's clock, off clears it, with Undo.
  const entrySwitch = (className?: string) => (
    <Switch
      label="Permission to enter"
      isSelected={v.entryPermitted}
      onChange={(entryPermitted) =>
        save(
          { entryPermitted },
          {
            done: entryPermitted ? "Permission to enter on" : "Permission to enter off",
            field: "access",
            undo: { entryPermitted: v.entryPermitted },
          },
        )
      }
      className={className}
    />
  );

  return (
    <>
      <div
        className={cn(
          // Below lg: one row of chips. The vertical padding keeps the chips' 44px touch area inside the scroller.
          "-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]! md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden",
          "lg:mx-0 lg:block lg:overflow-visible lg:p-0",
          className,
        )}
      >
        <Row label="Assignee">
          <AssigneePicker
            value={v.assignee}
            users={users}
            contractors={contractors}
            meId={meId}
            recent={recent}
            size="sm"
            // The rail's empty fact is a verb.
            placeholder="Assign"
            onChange={assign}
          />
        </Row>
        <Row label="Due">
          <DatePicker
            value={v.dueDate}
            today={today}
            overdue={overdue}
            onChange={(dueDate) =>
              save(
                { dueDate },
                {
                  done: dueDate ? `Due date set to ${fmtShortDay(dueDate, today)}` : "Due date cleared",
                  field: "due",
                  undo: { dueDate: v.dueDate },
                },
              )
            }
            // Repeat lives inside Due (selectors question 7): a Repeat row ends the date panel.
            withRepeat={{
              value: v.repeatRule,
              slot: repeatSlot,
              onChange: (repeatRule) => {
                // A repeat on an undated task dates it to the first occurrence (the service does it too),
                // so the chip shows that date at once and Undo takes it back with the rule.
                const dated = repeatRule && !v.dueDate ? repeatDue(repeatRule, null, today) : null;
                save(
                  { repeatRule, ...(dated ? { dueDate: dated } : {}) },
                  {
                    done: repeatRule ? `Repeats ${lowerFirst(describeRepeat(repeatRule, { short: true, from }))}` : "Repeat turned off",
                    detail: dated ? `Due ${fmtShortDay(dated, today)}` : undefined,
                    field: "repeat",
                    undo: { repeatRule: v.repeatRule, ...(dated ? { dueDate: null } : {}) },
                  },
                );
              },
            }}
          />
        </Row>
        {status === "SCHEDULED" && (
          <Row label="Scheduled">
            <DatePicker
              label="Visit date"
              placeholder="Pick a date"
              prefix={<span className="text-muted-foreground lg:hidden">Visit</span>}
              value={v.scheduledFor}
              today={today}
              // A scheduled job needs a visit date: "No date" is never offered.
              allowNone={false}
              onChange={(scheduledFor) =>
                save(
                  { scheduledFor },
                  {
                    done: scheduledFor ? `Visit set to ${fmtShortDay(scheduledFor, today)}` : "Visit date cleared",
                    field: "visit",
                    undo: { scheduledFor: v.scheduledFor },
                  },
                )
              }
            />
          </Row>
        )}
        <Row label="Property">
          <PropertyPicker
            value={v.propertyId}
            properties={properties}
            // The rail's empty fact is a verb.
            placeholder="Add property"
            onChange={changeProperty}
          />
        </Row>
        {property && offersUnits(property.units, v.unitLabel) && (
          <Row label="Unit">
            <UnitPicker
              value={v.unitLabel}
              units={property.units}
              placeholder="Add unit"
              onChange={(unitLabel) =>
                save(
                  { unitLabel },
                  {
                    done: unitLabel ? `Unit set to ${unitDisplay(unitLabel)}` : "Unit cleared",
                    field: "unit",
                    undo: { unitLabel: v.unitLabel },
                  },
                )
              }
            />
          </Row>
        )}
        {v.repeatRule && (
          <Row label="Repeats">
            {/* Read-only: set it inside the due date. relative: the chip row below lg scrolls, and nothing may widen the page. */}
            <span className="relative inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap px-2 text-meta text-muted-foreground lg:px-0 [&_svg]:size-3.5 [&_svg]:shrink-0">
              <Repeat aria-hidden="true" />
              {describeRepeat(v.repeatRule, { short: true, from })}
            </span>
          </Row>
        )}
        {tenants && <TenantsRow tenants={tenants} />}
        {/* In the rail between Tenant and Lockbox; below lg it's a line under the chips, after this row. */}
        {entryOffered && (
          <div className="hidden min-h-10 items-center border-b border-border lg:flex lg:pointer-coarse:min-h-12">{entrySwitch()}</div>
        )}
        {resident?.pets && (
          <Row label="Pets">
            <span className="relative inline-flex min-h-7 items-center whitespace-nowrap px-2 text-body text-foreground lg:whitespace-normal lg:px-0 lg:py-1.5">
              <span className="lg:hidden">Pets:&nbsp;</span>
              {resident.petsNote?.trim() ? (
                <>
                  <span className="hidden lg:inline">Yes,&nbsp;</span>
                  {resident.petsNote.trim()}
                </>
              ) : (
                "Yes"
              )}
            </span>
          </Row>
        )}
        {resident && (
          <Row label="Requested by">
            <span className="relative inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap px-2 lg:px-0">
              <Link href={`/tenants/${resident.leaseId}`} className="text-body text-foreground underline-offset-4 hover:underline">
                <span className="lg:hidden">From </span>
                {firstName(resident.tenantName) || resident.tenantName}
              </Link>
              {/* A status change emails them (section 5); the comments never reach them. */}
              <span className="text-meta text-muted-foreground">· sees status</span>
            </span>
          </Row>
        )}
        {lockbox && (
          <Row label="Lockbox">
            {lockbox.state === "shown" ? (
              // The code copies on a tap; the Tag says the contractor sees it too, which at an occupied home takes
              // Permission to enter. In the rail a long imported code ("4857 (back door)") wraps and the Tag drops
              // under it; below lg the chip row scrolls instead.
              <span className="relative inline-flex min-h-7 items-center gap-2 whitespace-nowrap px-2 lg:flex-wrap lg:gap-y-1 lg:whitespace-normal lg:px-0 lg:py-1.5">
                <Code value={lockbox.code} label="Lockbox code" wrap className="min-w-0" />
                {lockbox.contractorSees && (
                  <span className={tagClass}>
                    {/* Short so the Tag stays one line; the full sentence is what's read out. */}
                    {lockbox.hasLogin ? (
                      `Shown to ${lockbox.contractor}`
                    ) : (
                      <>
                        <span aria-hidden="true">Once {lockbox.contractor} signs in</span>
                        <span className="sr-only">{lockbox.contractor} sees the lockbox code after signing in</span>
                      </>
                    )}
                  </span>
                )}
              </span>
            ) : (
              // relative: the sr-only text is absolute, and must stay inside the phone chip row's scroller, not widen the page.
              <span className="relative inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap px-2 text-meta text-muted-foreground lg:items-start lg:whitespace-normal lg:px-0 lg:py-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 lg:[&_svg]:mt-0.5">
                <KeyRound aria-hidden="true" />
                <span aria-hidden="true">Pick a unit for the code</span>
                <span className="sr-only">Pick a unit so {lockbox.contractor} sees the lockbox code</span>
              </span>
            )}
          </Row>
        )}
        <Row label="Created" className="hidden lg:flex">
          <span className="block truncate text-meta text-muted-foreground">{created}</span>
        </Row>
      </div>
      {entryOffered && entrySwitch("lg:hidden")}
    </>
  );
}

/** Call and Text for one tenant, as on a contractor's record: Text on touch only, where a tap opens Messages (Q13). */
function PhoneLinks({ person }: { person: TaskTenant }) {
  const first = person.name.split(/\s+/)[0] || person.name;
  const tel = telHref(person.dial);
  const sms = textHref(person.dial);
  const link = cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-muted-foreground");
  return (
    <>
      {tel && (
        <a href={tel} aria-label={`Call ${first}`} title={person.phone ? `Call ${person.phone}` : "Call"} className={link}>
          <Phone aria-hidden="true" className="size-4" />
        </a>
      )}
      {sms && (
        <a href={sms} aria-label={`Text ${first}`} title="Text" className={cn(link, "pointer-fine:hidden")}>
          <MessageSquareText aria-hidden="true" className="size-4" />
        </a>
      )}
    </>
  );
}

/**
 * Who lives there (docs/specs/tenant-contact.md section 4, tenants.md section 8). In the rail, each person on a
 * line, the name (to the lease, T7) over the number, with Call and Text. Below lg, one chip ("Dana Lee +2") that
 * opens a menu with each person's number, Call and Text, then Open lease. Text is left out with a mouse.
 */
function TenantsRow({ tenants }: { tenants: TaskTenants }) {
  const coarse = useCoarsePointer();
  const label = tenants.people.length === 1 ? "Tenant" : "Tenants";
  const lease = `/tenants/${tenants.leaseId}`;
  const [first] = tenants.people;
  const more = tenants.people.length - 1;
  if (!first) return null;
  return (
    <Row label={label}>
      <div className="hidden min-w-0 py-1.5 lg:block">
        <ul className="space-y-1">
          {tenants.people.map((t, i) => (
            <li key={i} className="flex min-w-0 items-center gap-0.5">
              <div className="min-w-0 flex-1">
                <Link href={lease} className="block truncate text-body text-foreground hover:underline">
                  {t.name}
                </Link>
                {t.phone && <span className="num block whitespace-nowrap text-meta text-muted-foreground">{t.phone}</span>}
              </div>
              <PhoneLinks person={t} />
            </li>
          ))}
        </ul>
        {tenants.moveLine && <p className="mt-1 text-meta text-muted-foreground">{tenants.moveLine}</p>}
      </div>
      <MenuTrigger>
        <AriaButton
          aria-label={`${label}: ${tenants.people.map((t) => t.name).join(", ")}`}
          className={cn(pickerChipClass({ size: "sm" }), "max-w-56 lg:hidden")}
        >
          <span className="min-w-0 truncate">{first.name}</span>
          {more > 0 && <span className="shrink-0 text-muted-foreground">+{more}</span>}
        </AriaButton>
        <Menu sheetTitle={label} placement="bottom start">
          {tenants.people.map((t, i) => {
            const name = t.name.split(/\s+/)[0] || t.name;
            const tel = telHref(t.dial);
            const sms = textHref(t.dial);
            return (
              <MenuSection key={i}>
                <MenuHeader title={t.name} detail={t.phone ?? undefined} />
                {tel && (
                  <MenuItem id={`call-${i}`} icon={<Phone />} onAction={() => window.location.assign(tel)}>
                    {`Call ${name}`}
                  </MenuItem>
                )}
                {sms && coarse && (
                  <MenuItem id={`text-${i}`} icon={<MessageSquareText />} onAction={() => window.location.assign(sms)}>
                    {`Text ${name}`}
                  </MenuItem>
                )}
              </MenuSection>
            );
          })}
          <MenuSeparator />
          <MenuItem id="lease" href={lease}>
            Open lease
          </MenuItem>
        </Menu>
      </MenuTrigger>
    </Row>
  );
}

/** One field: in the rail, a 112px label in --muted-foreground and the chip, over a hairline; 40px rows, 48 on touch. */
function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center lg:min-h-10 lg:gap-3 lg:border-b lg:border-border lg:last:border-0 lg:pointer-coarse:min-h-12",
        className,
      )}
    >
      <span className="hidden w-28 shrink-0 text-meta text-muted-foreground lg:block">{label}</span>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
