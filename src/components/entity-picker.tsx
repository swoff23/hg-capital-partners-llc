"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, CircleDashed, DoorOpen, House } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Avatar } from "@/components/avatar";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { OptionList, SEARCH_FROM, countOptions, type OptionItem, type OptionSection } from "@/components/option-list";
import { PickerLayer } from "@/components/picker-layer";
import { PhotoThumb } from "@/components/photo-thumb";
import { pickerChipClass, pickerField, pickerFieldChevron, type PickerChipSize } from "@/components/ui";
import { assigneeKey, youFirst } from "@/lib/tasks/assignee-people";
import { propertySubline, unitDisplay, type PropertyOption } from "@/lib/picker-options-shape";
import { cn } from "@/lib/utils";

/**
 * Pick a person or a building fast, with no doubt about who or where
 * (docs/specs/selectors.md 3.3): `AssigneePicker`, `PropertyPicker` and
 * `UnitPicker`, thin wrappers on one `EntityPicker` over `OptionList`.
 *
 * Two triggers. A **chip** (the default) for list rows, the record rail and
 * create forms: a leading Avatar 20 or lucide icon, then the name, truncated;
 * empty, a dashed circle and a placeholder in --fg-3 (a verb in the rail:
 * "Assign", "Add property"). No chevron. A **field** (`trigger="field"`) for a
 * form where the pick is the main decision: the same at field height, with a
 * chevron. A pick commits and closes; picking the current value closes without
 * a write. A mouse opens an anchored popover, a touch phone a titled sheet, and
 * inside a sheet the list replaces the sheet's body with a back arrow.
 *
 * The item builders (`assigneeRows`, `propertyRows`, `unitRows`) are exported
 * for filter mode: a filter chip or the Filters sheet lists the same rows in an
 * `OptionList` with `selectionMode="multiple"` and counts.
 */

/* ---------------- The picker ---------------- */

export type EntityDisplay = {
  /** The visual before the name: an Avatar 20, a lucide icon. */
  leading: ReactNode;
  /** The name as shown. */
  text: string;
  /** Below `sm`, where a narrow column needs it: the short form of the name. */
  shortText?: string;
  /** After `shortText`, in --fg-3 and never cut: "(you)". A field drops it below 360px, where the name needs the room. */
  shortSuffix?: string;
  /** Nothing is picked: the placeholder, in --fg-3. */
  empty: boolean;
};

export type EntityPickerProps = {
  /** The field's name: "Assignee". The phone sheet's title and the trigger's accessible name. */
  label: string;
  /** What it's about, to name the control in a list: "Fix the sink" reads "Assignee for Fix the sink: Zack". */
  subject?: string;
  display: EntityDisplay;
  /** "chip" (the default) in a row of chips; "field" at field height in a form. */
  trigger?: "chip" | "field";
  /** The chip's size: `sm` 32px (the rail and forms, the default) or `row` 28px in a list row; 44 on touch either way. */
  size?: PickerChipSize;
  pinned?: OptionItem[];
  sections?: OptionSection[];
  items?: OptionItem[];
  selectedKey: string | null;
  /** A different pick; the current one closes without calling this. */
  onPick: (key: string) => void;
  searchLabel: string;
  emptyText: string;
  isDisabled?: boolean;
  /** "public" puts the dark public tokens on the list. */
  surface?: "app" | "public";
  className?: string;
};

export function EntityPicker({
  label,
  subject,
  display,
  trigger = "chip",
  size = "sm",
  pinned,
  sections,
  items,
  selectedKey,
  onPick,
  searchLabel,
  emptyText,
  isDisabled,
  surface,
  className,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const field = trigger === "field";
  // A list with a search field needs room to type; a short one is as wide as its widest row or the trigger.
  const searchable = countOptions({ pinned, items, sections }) >= SEARCH_FROM;
  return (
    <PickerLayer
      isOpen={open}
      onOpenChange={setOpen}
      title={label}
      surface={surface}
      popoverClassName={searchable ? "min-w-64 max-w-80" : "min-w-[min(var(--trigger-width),20rem)] max-w-80"}
      trigger={
        <AriaButton
          isDisabled={isDisabled}
          data-placeholder={display.empty || undefined}
          className={cn(
            field ? pickerField : pickerChipClass({ size }),
            field ? !display.empty && "pl-2" : cn("pl-1", display.empty && "pl-2"),
            display.empty && "text-fg-3",
            className,
          )}
        >
          {/* The name comes from the text shown, so it holds what's on screen at every width
              ("Assignee: Connor (you)" below sm), for voice control (WCAG 2.5.3). */}
          <span className="sr-only">{`${label}${subject ? ` for ${subject}` : ""}: `}</span>
          {display.leading}
          {display.shortText ? (
            <>
              <span className={cn("flex min-w-0 items-baseline gap-1 sm:hidden", field && "flex-1")}>
                <span className="truncate">{display.shortText}</span>
                {display.shortSuffix && (
                  <>
                    {" "}
                    <span className={cn("shrink-0 text-fg-3", field && "max-[360px]:hidden")}>{display.shortSuffix}</span>
                  </>
                )}
              </span>
              <span className={cn("truncate max-sm:hidden", field && "flex-1")}>{display.text}</span>
            </>
          ) : (
            <span className={cn("truncate", field && "flex-1")}>{display.text}</span>
          )}
          {field && <ChevronDown aria-hidden="true" className={pickerFieldChevron} />}
        </AriaButton>
      }
    >
      {({ container, close }) => (
        <OptionList
          aria-label={label}
          container={container}
          pinned={pinned}
          sections={sections}
          items={items}
          selectedKey={selectedKey}
          onPick={(key) => {
            close();
            if (key !== selectedKey) onPick(key);
          }}
          onTab={close}
          searchLabel={searchLabel}
          emptyText={emptyText}
        />
      )}
    </PickerLayer>
  );
}

const emptyMark = <CircleDashed aria-hidden="true" />;

/** The empty choice's dashed circle in a box the size of the visual its list leads rows with (an Avatar 24, a PhotoThumb 32). */
function EmptyMark({ box }: { box: "size-6" | "size-8" }) {
  return (
    <span aria-hidden="true" className={cn("flex items-center justify-center", box)}>
      <CircleDashed className="size-5 text-fg-3" />
    </span>
  );
}

/* ---------------- Assignee ---------------- */

const NONE = "none";
const valueOfKey = (key: string): AssigneeValue => {
  if (key.startsWith("u:")) return { userId: key.slice(2) };
  if (key.startsWith("c:")) return { contactId: key.slice(2) };
  return null;
};
export const assigneeKeyOf = (v: AssigneeValue): string => (v ? (assigneeKey(v as { userId?: string; contactId?: string }) ?? NONE) : NONE);

/** A row's id for the Recent copy of a pick; its `alias` is the pick. */
const RECENT_PREFIX = "recent:";

/**
 * The assignee rows: "Unassigned" pinned first; Recent (up to 3, only while
 * the search is empty); Team with you first and "(you)" after your name;
 * Contractors with a square avatar, the trade under the name and a "Has login"
 * Tag. Search matches name, trade and email. `counts` (open tasks per key)
 * adds the trailing count of filter mode.
 */
export function assigneeRows({
  users,
  contractors,
  meId,
  recent = [],
  counts,
}: {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  meId?: string;
  recent?: AssigneeValue[];
  counts?: ReadonlyMap<string, number>;
}): { pinned: OptionItem[]; sections: OptionSection[] } {
  const count = (key: string) => (counts ? (counts.get(key) ?? 0) : undefined);
  const userRow = (u: AssigneeUser, id = `u:${u.id}`, extra: Partial<OptionItem> = {}): OptionItem => ({
    id,
    label: u.name || u.email,
    searchText: u.email,
    suffix: u.id === meId ? "(you)" : undefined,
    leading: <Avatar name={u.name} email={u.email} size={24} />,
    count: count(`u:${u.id}`),
    ...extra,
  });
  const contractorRow = (c: AssigneeContractor, id = `c:${c.id}`, extra: Partial<OptionItem> = {}): OptionItem => ({
    id,
    label: c.name,
    searchText: [c.trade, c.email].filter(Boolean).join(" "),
    description: c.trade ?? undefined,
    tag: c.hasLogin ? "Has login" : undefined,
    leading: <Avatar name={c.name} size={24} outline />,
    count: count(`c:${c.id}`),
    ...extra,
  });

  const recentRows = recent.flatMap((v): OptionItem[] => {
    const key = assigneeKey(v as { userId?: string; contactId?: string });
    if (!key) return [];
    const extra = { id: RECENT_PREFIX + key, alias: key, whenSearchEmpty: true, count: undefined };
    if (key.startsWith("u:")) {
      const u = users.find((x) => `u:${x.id}` === key);
      return u ? [userRow(u, extra.id, extra)] : [];
    }
    const c = contractors.find((x) => `c:${x.id}` === key);
    return c ? [contractorRow(c, extra.id, extra)] : [];
  });

  return {
    // The mark sits in the avatars' 24px box, so "Unassigned" starts where the names do.
    pinned: [{ id: NONE, label: "Unassigned", muted: true, leading: <EmptyMark box="size-6" /> }],
    sections: [
      ...(recentRows.length ? [{ id: "recent", title: "Recent", items: recentRows }] : []),
      ...(users.length ? [{ id: "team", title: "Team", items: youFirst(users, meId).map((u) => userRow(u)) }] : []),
      ...(contractors.length ? [{ id: "contractors", title: "Contractors", items: contractors.map((c) => contractorRow(c)) }] : []),
    ],
  };
}

/**
 * Who a task is assigned to: a staff user, a contractor (Contact), or nobody
 * (docs/specs/selectors.md 3.3). The chip shows the avatar and name;
 * contractors get the square avatar. Type to filter by name, trade or email.
 *
 * `meId` is the signed-in user: you come first in Team with "(you)" after
 * your name, and below sm the trigger shows first names, "Connor (you)" for
 * you, so a narrow column keeps the name whole. Only the label changes; the
 * value stays `{ userId }`. `recent` is the people you assigned last (up to 3,
 * `assigneeOptions` fills it), listed first while the search is empty.
 * `placeholder` is what an empty chip says: "Unassigned" in a form, the verb
 * "Assign" in the rail.
 */
export function AssigneePicker({
  value,
  users,
  contractors,
  onChange,
  label = "Assignee",
  subject,
  meId,
  recent,
  placeholder = "Unassigned",
  trigger = "chip",
  size = "row",
  isDisabled,
  surface,
  className,
}: {
  value: AssigneeValue;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  onChange: (value: AssigneeValue) => void;
  label?: string;
  subject?: string;
  /** The signed-in user's id: you first, "(you)", and short names below sm. */
  meId?: string;
  /** The people you assigned most recently, newest first. */
  recent?: AssigneeValue[];
  placeholder?: string;
  /** "chip" in a row of chips; "field" at field height in a form. */
  trigger?: "chip" | "field";
  /** The chip's size: `row` 28px (the default, as every importer drew it) or `sm` 32px in the record rail. */
  size?: PickerChipSize;
  isDisabled?: boolean;
  surface?: "app" | "public";
  className?: string;
}) {
  const user = value && "userId" in value ? users.find((u) => u.id === value.userId) : undefined;
  const contractor = value && "contactId" in value ? contractors.find((c) => c.id === value.contactId) : undefined;
  const name = user ? user.name || user.email : contractor?.name;
  // Below sm, with meId: first names, and "(you)" after the signed-in user's.
  const first = name?.trim().split(/\s+/)[0];
  const short = meId && first ? first : undefined;
  const rows = assigneeRows({ users, contractors, meId, recent });

  return (
    <EntityPicker
      label={label}
      subject={subject}
      trigger={trigger}
      size={size}
      display={{
        leading: user ? (
          <Avatar name={user.name} email={user.email} size={20} />
        ) : contractor ? (
          <Avatar name={contractor.name} size={20} outline />
        ) : (
          <CircleDashed aria-hidden="true" className={cn(trigger === "field" && "text-fg-3")} />
        ),
        text: name ?? placeholder,
        shortText: name ? short : undefined,
        shortSuffix: name && user?.id === meId ? "(you)" : undefined,
        empty: !name,
      }}
      pinned={rows.pinned}
      sections={rows.sections}
      selectedKey={assigneeKeyOf(value)}
      onPick={(key) => onChange(valueOfKey(key))}
      searchLabel="Search people"
      emptyText="No one matches."
      isDisabled={isDisabled}
      surface={surface}
      className={className}
    />
  );
}

/* ---------------- Property ---------------- */

const NO_PROPERTY = "none";

/**
 * The property rows: "No property" pinned (left out where a property is
 * required), then each building with its photo, short address and "Buffalo · 3
 * units" under it, in street order (`propertyOptions` sorts). Search matches
 * the short and full address, the town and unit labels. `counts` adds filter
 * mode's trailing count.
 */
export function propertyRows({
  properties,
  required = false,
  emptyLabel = "No property",
  counts,
}: {
  properties: PropertyOption[];
  required?: boolean;
  emptyLabel?: string;
  counts?: ReadonlyMap<string, number>;
}): { pinned: OptionItem[]; items: OptionItem[] } {
  return {
    pinned: required
      ? []
      : [{ id: NO_PROPERTY, label: emptyLabel, muted: true, leading: <EmptyMark box="size-8" /> }],
    items: properties.map((p) => ({
      id: p.id,
      label: p.label,
      searchText: [p.address, ...p.units].join(" "),
      description: propertySubline(p) || undefined,
      leading: <PhotoThumb size={32} src={p.photoUrl} alt="" />,
      count: counts ? (counts.get(p.id) ?? 0) : undefined,
    })),
  };
}

/**
 * A property: the chip or field for the building a task, playbook or deal is
 * about. `value` is the property's id. With `required` there is no "No
 * property" row and an empty field reads "Choose a property".
 */
export function PropertyPicker({
  value,
  properties,
  onChange,
  label = "Property",
  subject,
  required = false,
  placeholder,
  trigger = "chip",
  size,
  isDisabled,
  surface,
  className,
}: {
  value: string | null;
  properties: PropertyOption[];
  onChange: (propertyId: string | null) => void;
  label?: string;
  subject?: string;
  /** No empty choice: a pick is needed ("Choose a property"). */
  required?: boolean;
  /** What an empty trigger says: "No property" in a form, the verb "Add property" in the rail. */
  placeholder?: string;
  trigger?: "chip" | "field";
  size?: PickerChipSize;
  isDisabled?: boolean;
  surface?: "app" | "public";
  className?: string;
}) {
  const current = value ? properties.find((p) => p.id === value) : undefined;
  const rows = propertyRows({ properties, required });
  const empty = placeholder ?? (required ? "Choose a property" : "No property");
  return (
    <EntityPicker
      label={label}
      subject={subject}
      trigger={trigger}
      size={size}
      display={{
        leading: current ? <House aria-hidden="true" className={cn(trigger === "field" && "text-fg-3")} /> : emptyMark,
        text: current?.label ?? empty,
        empty: !current,
      }}
      pinned={rows.pinned}
      items={rows.items}
      selectedKey={value ?? (required ? null : NO_PROPERTY)}
      onPick={(key) => onChange(key === NO_PROPERTY ? null : key)}
      searchLabel="Search properties"
      emptyText="No property matches."
      isDisabled={isDisabled}
      surface={surface}
      className={className}
    />
  );
}

/* ---------------- Unit ---------------- */

const NO_UNIT = "__none__";

/** The unit rows: "No unit" pinned (left out where a unit is required), then each label as written ("Unit 5", "Floor 1 / Lower"). */
export function unitRows({
  units,
  current,
  required = false,
  counts,
}: {
  units: readonly string[];
  /** The stored label, kept as its own row when the building no longer lists it. */
  current?: string | null;
  required?: boolean;
  counts?: ReadonlyMap<string, number>;
}): { pinned: OptionItem[]; items: OptionItem[] } {
  const stray = current && !units.includes(current) ? [{ id: current, label: unitDisplay(current), muted: true }] : [];
  return {
    // Unit rows carry no mark, so neither does the empty choice: every title starts at one x.
    pinned: required ? [] : [{ id: NO_UNIT, label: "No unit", muted: true }],
    items: [
      ...stray,
      ...units.map((u) => ({ id: u, label: unitDisplay(u), count: counts ? (counts.get(u) ?? 0) : undefined })),
    ],
  };
}

/**
 * A unit in a building. The caller shows it from two units (`offersUnits`) or
 * when a unit is already set. `value` is the unit's label as stored.
 */
export function UnitPicker({
  value,
  units,
  onChange,
  label = "Unit",
  subject,
  required = false,
  placeholder,
  trigger = "chip",
  size,
  isDisabled,
  surface,
  className,
}: {
  value: string | null;
  units: readonly string[];
  onChange: (unit: string | null) => void;
  label?: string;
  subject?: string;
  required?: boolean;
  /** What an empty trigger says: "Choose a unit" where required, the verb "Add unit" in the rail. */
  placeholder?: string;
  trigger?: "chip" | "field";
  size?: PickerChipSize;
  isDisabled?: boolean;
  surface?: "app" | "public";
  className?: string;
}) {
  const rows = unitRows({ units, current: value, required });
  const empty = placeholder ?? (required ? "Choose a unit" : "No unit");
  return (
    <EntityPicker
      label={label}
      subject={subject}
      trigger={trigger}
      size={size}
      display={{
        leading: value ? <DoorOpen aria-hidden="true" className={cn(trigger === "field" && "text-fg-3")} /> : emptyMark,
        text: value ? unitDisplay(value) : empty,
        empty: !value,
      }}
      pinned={rows.pinned}
      items={rows.items}
      selectedKey={value ?? (required ? null : NO_UNIT)}
      onPick={(key) => onChange(key === NO_UNIT ? null : key)}
      searchLabel="Search units"
      emptyText="No unit matches."
      isDisabled={isDisabled}
      surface={surface}
      className={className}
    />
  );
}
