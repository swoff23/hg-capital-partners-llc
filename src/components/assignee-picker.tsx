"use client";
import { useState } from "react";
import { ChevronDown, CircleDashed, Check, Search } from "lucide-react";
import {
  Autocomplete,
  Button as AriaButton,
  DialogTrigger,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  SearchField,
  useFilter,
  type Key,
} from "react-aria-components";
import { Avatar } from "@/components/avatar";
import { Popover } from "@/components/popover";
import { Sheet } from "@/components/sheet";
import { pickerChip, pickerField, pickerFieldChevron } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { cn } from "@/lib/utils";

/** Who a task is assigned to: a staff user, a contractor (Contact), or nobody. Never both. */
export type AssigneeValue = { userId: string } | { contactId: string } | null;

export type AssigneeUser = { id: string; name: string | null; email: string };
export type AssigneeContractor = {
  id: string;
  name: string;
  /** Contact.trades: "Plumbing", "Electric". Shown under the name and searched. */
  trade?: string | null;
  /** An active portal account, so they'll see the job when it's theirs. */
  hasLogin?: boolean;
};

const NONE = "none";
const keyOf = (v: AssigneeValue): string => (!v ? NONE : "userId" in v ? `u:${v.userId}` : `c:${v.contactId}`);
function valueOf(key: string): AssigneeValue {
  if (key.startsWith("u:")) return { userId: key.slice(2) };
  if (key.startsWith("c:")) return { contactId: key.slice(2) };
  return null;
}

/**
 * Pick a task's assignee: Unassigned, then Team (users), then Contractors
 * (contacts, with their trade and whether they have a portal login). Type to
 * filter by name or trade. A Popover with a mouse, a Sheet on touch. The
 * chip shows the avatar and name; contractors get the outline avatar.
 *
 * Built as React Aria's searchable list (Autocomplete: a search field acting
 * as the combobox over a ListBox), because the trigger is a chip, not a
 * text field.
 *
 * `meId` is the signed-in user: below sm the trigger then shows first names,
 * "Connor (me)" for them and "Zack" for anyone else, so a narrow column keeps
 * the name whole. Only the label changes; the value stays `{ userId }`.
 * `trigger="field"` is the field-height trigger (pickerField) for a form grid.
 */
export function AssigneePicker({
  value,
  users,
  contractors,
  onChange,
  label = "Assignee",
  meId,
  trigger = "chip",
  isDisabled,
  className,
}: {
  value: AssigneeValue;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  onChange: (value: AssigneeValue) => void;
  label?: string;
  /** The signed-in user's id, for the short "First (me)" label below sm. */
  meId?: string;
  /** "chip" in a row of chips; "field" at field height in a form. */
  trigger?: "chip" | "field";
  isDisabled?: boolean;
  className?: string;
}) {
  const touch = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const selectedKey = keyOf(value);
  const user = value && "userId" in value ? users.find((u) => u.id === value.userId) : undefined;
  const contractor = value && "contactId" in value ? contractors.find((c) => c.id === value.contactId) : undefined;
  const name = user ? user.name || user.email : contractor?.name;
  // Below sm, with meId: first names, and "(me)" for the signed-in user.
  const first = name?.trim().split(/\s+/)[0];
  const short = meId && first ? (user?.id === meId ? `${first} (me)` : first) : null;
  const field = trigger === "field";

  function pick(key: string | null) {
    setOpen(false);
    if (key !== null && key !== selectedKey) onChange(valueOf(key));
  }

  const panel = (
    <AssigneeList
      users={users}
      contractors={contractors}
      selectedKey={selectedKey}
      autoFocus={!touch}
      inSheet={touch}
      onPick={pick}
    />
  );

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <AriaButton
        isDisabled={isDisabled}
        className={cn(
          field ? pickerField : pickerChip,
          field ? name && "pl-2" : cn("pl-1", !name && "pl-2"),
          !name && "text-fg-3",
          className,
        )}
      >
        {/* The name comes from the text shown, so it holds what's on screen at every width
            ("Assignee: Connor (me)" below sm), for voice control (WCAG 2.5.3). */}
        <span className="sr-only">{`${label}: `}</span>
        {user ? (
          <Avatar name={user.name} email={user.email} size={20} />
        ) : contractor ? (
          <Avatar name={contractor.name} size={20} outline />
        ) : (
          <CircleDashed aria-hidden="true" className={cn(field && "text-fg-3")} />
        )}
        {short ? (
          <>
            <span className={cn("truncate sm:hidden", field && "flex-1")}>{short}</span>
            <span className={cn("truncate max-sm:hidden", field && "flex-1")}>{name}</span>
          </>
        ) : (
          <span className={cn("truncate", field && "flex-1")}>{name ?? "Unassigned"}</span>
        )}
        {field && <ChevronDown aria-hidden="true" className={pickerFieldChevron} />}
      </AriaButton>
      {touch ? (
        <Sheet title={label}>{panel}</Sheet>
      ) : (
        <Popover aria-label={label} placement="bottom start" className="min-w-64 max-w-80">
          {panel}
        </Popover>
      )}
    </DialogTrigger>
  );
}

const itemClass = cn(
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-sm px-3 py-1 text-body outline-none pointer-coarse:min-h-11",
  "data-focused:bg-fill-2 data-pressed:bg-fill-2",
);
// Sentence case: no uppercase in the app.
const headerClass = "px-3 pb-1 pt-2.5 text-meta font-medium text-fg-3";

function AssigneeList({
  users,
  contractors,
  selectedKey,
  autoFocus,
  inSheet,
  onPick,
}: {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  selectedKey: string;
  autoFocus: boolean;
  inSheet: boolean;
  onPick: (key: string | null) => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });

  function onSelectionChange(keys: "all" | Set<Key>) {
    if (keys === "all") return;
    const [k] = keys;
    // Tapping the current pick toggles it off in React Aria; treat that as "keep it".
    onPick(k === undefined ? null : String(k));
  }

  return (
    <Autocomplete filter={contains}>
      <SearchField aria-label="Search people" autoFocus={autoFocus} className="border-b border-line p-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <Input
            placeholder="Search"
            className="h-8 w-full rounded-md bg-transparent pl-9 pr-3 text-body outline-none placeholder:text-fg-3 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </SearchField>
      <ListBox
        aria-label="People"
        selectionMode="single"
        selectedKeys={[selectedKey]}
        onSelectionChange={onSelectionChange}
        renderEmptyState={() => <p className="px-3 py-3 text-body text-fg-3">No one matches.</p>}
        className={cn("overflow-y-auto p-1 outline-none", inSheet ? "max-h-[60dvh]" : "max-h-72")}
      >
        <ListBoxItem id={NONE} textValue="Unassigned" className={itemClass}>
          {({ isSelected }) => (
            <>
              <CircleDashed className="h-5 w-5 shrink-0 text-fg-3" aria-hidden="true" />
              <span className="flex-1 text-fg-3">Unassigned</span>
              <Selected on={isSelected} />
            </>
          )}
        </ListBoxItem>
        {users.length > 0 && (
          <ListBoxSection>
            <Header className={headerClass}>Team</Header>
            {users.map((u) => (
              <ListBoxItem key={u.id} id={`u:${u.id}`} textValue={`${u.name ?? ""} ${u.email}`} className={itemClass}>
                {({ isSelected }) => (
                  <>
                    <Avatar name={u.name} email={u.email} size={24} />
                    <span className="min-w-0 flex-1 truncate">{u.name || u.email}</span>
                    <Selected on={isSelected} />
                  </>
                )}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        )}
        {contractors.length > 0 && (
          <ListBoxSection>
            <Header className={headerClass}>Contractors</Header>
            {contractors.map((c) => (
              <ListBoxItem key={c.id} id={`c:${c.id}`} textValue={`${c.name} ${c.trade ?? ""}`} className={itemClass}>
                {({ isSelected }) => (
                  <>
                    <Avatar name={c.name} size={24} outline />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{c.name}</span>
                        {c.hasLogin && (
                          <span className="inline-flex h-5.5 shrink-0 items-center rounded-sm px-2 text-micro text-fg-2 ring-1 ring-inset ring-line-strong">
                            Has login
                          </span>
                        )}
                      </span>
                      {c.trade && <span className="block truncate text-meta text-fg-3">{c.trade}</span>}
                    </span>
                    <Selected on={isSelected} />
                  </>
                )}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        )}
      </ListBox>
    </Autocomplete>
  );
}

function Selected({ on }: { on: boolean }) {
  return <Check className={cn("h-4 w-4 shrink-0 text-fg-1", !on && "invisible")} aria-hidden="true" />;
}
