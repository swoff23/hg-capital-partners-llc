"use client";

import { Lock } from "lucide-react";
import { Badge, Select, Table, Td, Th } from "@/components/ui";
import { Tooltip } from "@/components/tooltip";
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

  return (
    <Table className={flushTable}>
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
              {c.role === "UNMAPPED" && <Badge tone="warn">Needs mapping</Badge>}
              {c.autoMatched &&
                c.role !== "UNMAPPED" &&
                (c.note ? (
                  <Tooltip label={c.note}>
                    <Badge>Auto</Badge>
                  </Tooltip>
                ) : (
                  <Badge>Auto</Badge>
                ))}
            </Td>
            <Td className={cell}>
              <Select
                aria-label={`Role of ${c.fqn}`}
                className={rowSelect}
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
            </Td>
            <Td className={cell}>
              <Select
                aria-label={`Property of ${c.fqn}`}
                className={cn(rowSelect, "disabled:opacity-50")}
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
            </Td>
            <Td className={cell}>
              <Select
                aria-label={`Entity of ${c.fqn}`}
                className={rowSelect}
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
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
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
          <Th>Type</Th>
          <Th>Category</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {accounts.map((a) => (
          <tr key={a.id} className={pending ? "opacity-60" : "hover:bg-fill-1"}>
            <Td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                {a.fqn}
                {a.locked && (
                  <Tooltip label="Category set by you">
                    <Lock role="img" aria-label="Category set by you" className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                  </Tooltip>
                )}
              </span>
            </Td>
            <Td className={cn(cell, "text-fg-2")}>{a.acctType || a.classification}</Td>
            <Td className={cell}>
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
