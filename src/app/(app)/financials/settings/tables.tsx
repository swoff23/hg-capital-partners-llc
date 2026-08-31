"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge, Select, Table, Td, Th } from "@/components/ui";
import { CATEGORY_LABELS, ROLE_LABELS } from "../_components/labels";
import {
  mapClassToProperty,
  setAccountCategory,
  setClassEntity,
  setClassRole,
} from "./actions";

const ROLES = ["UNMAPPED", "PROPERTY", "ENTITY", "OVERHEAD", "IGNORE"];
const CATEGORIES = Object.keys(CATEGORY_LABELS);

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => router.refresh()));

  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th>Class</Th>
            <Th>Role</Th>
            <Th>Property</Th>
            <Th>Entity</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {classes.map((c) => (
            <tr key={c.id} className={pending ? "opacity-60" : "hover:bg-background"}>
              <Td>
                <span className="font-mono text-xs">{c.fqn}</span>
                {c.role === "UNMAPPED" && (
                  <Badge tone="red" className="ml-2">
                    needs mapping
                  </Badge>
                )}
                {c.autoMatched && c.role !== "UNMAPPED" && (
                  <Badge tone="gray" className="ml-2" title={c.note ?? undefined}>
                    auto
                  </Badge>
                )}
              </Td>
              <Td>
                <Select value={c.role} onChange={(e) => run(() => setClassRole(c.id, e.target.value))}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td>
                <Select
                  value={c.propertyId ?? ""}
                  disabled={c.role !== "PROPERTY"}
                  onChange={(e) => run(() => mapClassToProperty(c.id, e.target.value || null))}
                >
                  <option value="">—</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.address}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td>
                <Select
                  value={c.entityId ?? ""}
                  onChange={(e) => run(() => setClassEntity(c.id, e.target.value || null))}
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
    </div>
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
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th>Account</Th>
            <Th>Type</Th>
            <Th>Category</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map((a) => (
            <tr key={a.id} className={pending ? "opacity-60" : "hover:bg-background"}>
              <Td>
                <span className="font-mono text-xs">{a.fqn}</span>
                {a.locked && (
                  <span className="ml-2 text-[11px] text-muted" title="pinned">
                    🔒
                  </span>
                )}
              </Td>
              <Td className="text-xs text-muted">{a.acctType || a.classification}</Td>
              <Td>
                <Select
                  value={a.category}
                  onChange={(e) =>
                    start(() =>
                      setAccountCategory(a.id, e.target.value).then(() => router.refresh()),
                    )
                  }
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
    </div>
  );
}
