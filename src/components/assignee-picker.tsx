"use client";
import { useState } from "react";
import { CircleDashed, Check, Search } from "lucide-react";
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
import { pickerChip } from "@/components/ui";
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
 */
export function AssigneePicker({
  value,
  users,
  contractors,
  onChange,
  label = "Assignee",
  isDisabled,
  className,
}: {
  value: AssigneeValue;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  onChange: (value: AssigneeValue) => void;
  label?: string;
  isDisabled?: boolean;
  className?: string;
}) {
  const touch = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const selectedKey = keyOf(value);
  const user = value && "userId" in value ? users.find((u) => u.id === value.userId) : undefined;
  const contractor = value && "contactId" in value ? contractors.find((c) => c.id === value.contactId) : undefined;
  const name = user ? user.name || user.email : contractor?.name;

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
        aria-label={`${label}: ${name ?? "Unassigned"}`}
        className={cn(pickerChip, "pl-1", !name && "pl-2 text-muted", className)}
      >
        {user ? (
          <Avatar name={user.name} email={user.email} size={20} />
        ) : contractor ? (
          <Avatar name={contractor.name} size={20} outline />
        ) : (
          <CircleDashed aria-hidden="true" />
        )}
        <span className="truncate">{name ?? "Unassigned"}</span>
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
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-md px-3 py-1 text-sm outline-none pointer-coarse:min-h-11",
  "data-focused:bg-background data-pressed:bg-background",
);
const headerClass = "px-3 pb-1 pt-2.5 text-xs font-medium uppercase tracking-wide text-muted";

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
      <SearchField aria-label="Search people" autoFocus={autoFocus} className="border-b border-border p-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input
            placeholder="Search"
            className="h-8 w-full rounded-md bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </SearchField>
      <ListBox
        aria-label="People"
        selectionMode="single"
        selectedKeys={[selectedKey]}
        onSelectionChange={onSelectionChange}
        renderEmptyState={() => <p className="px-3 py-3 text-sm text-muted">No one matches.</p>}
        className={cn("overflow-y-auto p-1 outline-none", inSheet ? "max-h-[60dvh]" : "max-h-72")}
      >
        <ListBoxItem id={NONE} textValue="Unassigned" className={itemClass}>
          {({ isSelected }) => (
            <>
              <CircleDashed className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
              <span className="flex-1 text-muted">Unassigned</span>
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
                          <span className="shrink-0 rounded px-1 text-[10px] font-medium leading-4 text-muted ring-1 ring-inset ring-border">
                            Has login
                          </span>
                        )}
                      </span>
                      {c.trade && <span className="block truncate text-xs text-muted">{c.trade}</span>}
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
  return <Check className={cn("h-4 w-4 shrink-0 text-primary", !on && "invisible")} aria-hidden="true" />;
}
