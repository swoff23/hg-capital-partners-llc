"use client";

import { Lock } from "lucide-react";
import { Badge, Select, Table, Td, Th } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
import { shortAddress } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, ROLE_LABELS } from "../_components/labels";
import { flushTable } from "../_components/ui";
import { useSettingsAction } from "./controls";
import {
  mapClassToProperty,
  setAccountCategory,
  setClassEntity,
  setClassRole,
} from "./actions";

const ROLES = ["UNMAPPED", "PROPERTY", "ENTITY", "OVERHEAD", "IGNORE"];
const CATEGORIES = Object.keys(CATEGORY_LABELS);

/* A row that holds a select keeps the 40px row with a mouse (48 on touch):
   the select drops to the 32px sm control size, and the cell's padding
   shrinks around it. Text cells center on the same line. */
const cell = "py-1 align-middle pointer-coarse:py-0.5";
const rowSelect = "h-8";

export function ClassMappingTable({
  classes,
  properties,
  entities,
}: {
  classes: {
    id: string;
    fqn: string;
    role: string;
    propertyId: string | null;
    entityId: string | null;
    autoMatched: boolean;
    note: string | null;
  }[];
  properties: { id: string; address: string }[];
  entities: { id: string; name: string }[];
}) {
  const [pending, run] = useSettingsAction();

  type Row = (typeof classes)[number];
  const roleSelect = (c: Row, className?: string) => (
    <Select
      aria-label={`Role of ${c.fqn}`}
      className={cn(rowSelect, className)}
      value={c.role}
      onChange={(e) => {
        const role = e.target.value;
        run(() => setClassRole(c.id, role));
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
  const propertySelect = (c: Row, className?: string) => (
    <Select
      aria-label={`Property of ${c.fqn}`}
      className={cn(rowSelect, "disabled:opacity-50", className)}
      value={c.propertyId ?? ""}
      disabled={c.role !== "PROPERTY"}
      onChange={(e) => {
        const propertyId = e.target.value || null;
        run(() => mapClassToProperty(c.id, propertyId));
      }}
    >
      <option value="">—</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.address}
        </option>
      ))}
    </Select>
  );
  const entitySelect = (c: Row, className?: string) => (
    <Select
      aria-label={`Entity of ${c.fqn}`}
      className={cn(rowSelect, className)}
      value={c.entityId ?? ""}
      onChange={(e) => {
        const entityId = e.target.value || null;
        run(() => setClassEntity(c.id, entityId));
      }}
    >
      <option value="">—</option>
      {entities.map((en) => (
        <option key={en.id} value={en.id}>
          {en.name}
        </option>
      ))}
    </Select>
  );
  // The Auto badge says what it matched in plain words; one it can't name keeps the badge alone.
  const badges = (c: Row) => {
    const matched = c.propertyId ? properties.find((p) => p.id === c.propertyId) : undefined;
    return (
      <>
        {c.role === "UNMAPPED" && <Badge tone="warn">Needs mapping</Badge>}
        {c.autoMatched &&
          c.role !== "UNMAPPED" &&
          (matched ? (
            <Tooltip label={`Matched to ${shortAddress(matched.address) || matched.address} by address`}>
              <Badge>Auto</Badge>
            </Tooltip>
          ) : (
            <Badge>Auto</Badge>
          ))}
      </>
    );
  };

  return (
    <>
      {/* Below sm each class is a block: its name and badge, then Role, Property and Entity at
          full width beside their labels, as a record's rail lays out its facts. */}
      <ul className={cn("divide-y divide-line sm:hidden", pending && "opacity-60")}>
        {classes.map((c) => (
          <li key={c.id} className="space-y-2 py-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg-1">
              <span className="min-w-0 [overflow-wrap:anywhere]">{c.fqn}</span>
              {badges(c)}
            </p>
            {(
              [
                ["Role", roleSelect(c)],
                ["Property", propertySelect(c)],
                ["Entity", entitySelect(c)],
              ] as const
            ).map(([label, control]) => (
              <div key={label} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
                <span className="text-meta text-fg-3">{label}</span>
                {control}
              </div>
            ))}
          </li>
        ))}
      </ul>

      <Table className={cn(flushTable, "max-sm:hidden")}>
        <thead>
          <tr>
            <Th>Class</Th>
            <Th>Role</Th>
            <Th>Property</Th>
            <Th>Entity</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {classes.map((c) => (
            <tr key={c.id} className={pending ? "opacity-60" : "hover:bg-fill-1"}>
              <Td className={cell}>
                <span className="mr-2">{c.fqn}</span>
                {badges(c)}
              </Td>
              <Td className={cell}>{roleSelect(c)}</Td>
              <Td className={cell}>{propertySelect(c)}</Td>
              <Td className={cell}>{entitySelect(c)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

export function AccountCategoryTable({
  accounts,
}: {
  accounts: {
    id: string;
    fqn: string;
    acctType: string;
    classification: string;
    category: string;
    locked: boolean;
  }[];
}) {
  const [pending, run] = useSettingsAction();

  return (
    <Table className={flushTable}>
      <thead>
        <tr>
          <Th>Account</Th>
          {/* Below sm the type moves under the account's name, so Account and Category fit. */}
          <Th className="max-sm:hidden">Type</Th>
          <Th>Category</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {accounts.map((a) => (
          <tr key={a.id} className={pending ? "opacity-60" : "hover:bg-fill-1"}>
            <Td className={cell}>
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
            {/* On a phone the select takes the half of the row the name leaves. */}
            <Td className={cn(cell, "max-sm:w-1/2")}>
              <Select
                aria-label={`Category of ${a.fqn}`}
                className={rowSelect}
                value={a.category}
                onChange={(e) => {
                  const category = e.target.value;
                  run(() => setAccountCategory(a.id, category));
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
