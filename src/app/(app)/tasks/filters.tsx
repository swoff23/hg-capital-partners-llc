"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control";
import { Input, Select } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;

type Option = { value: string; label: string };

// The fields match the status switch's height: 36px with a mouse, 48 on touch
// (its 44px segments in a 2px track), so the row lines up at every width.
const field = "pointer-coarse:h-12";

/**
 * The All tab's filters: title search, status, assignee (team, contractors
 * as c:<contactId>, and legacy free-text names), property. State lives in
 * the URL. On a phone the search and status share a row over the two
 * pickers; every control shrinks to fit rather than wrap, down to 320.
 */
export function TaskFilters({
  current,
  owners,
  properties,
}: {
  current: { status: string; owner: string; q: string; property: string };
  owners: { users: Option[]; contacts: Option[]; external: Option[] };
  properties: { id: string; address: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string, { replace = false }: { replace?: boolean } = {}) {
    const next = new URLSearchParams(params);
    const isDefault = (key === "status" && value === "open") || !value;
    if (isDefault) next.delete(key);
    else next.set(key, value);
    if (key === "owner") next.delete("assignee"); // supersedes the legacy ?assignee=me shortcut
    const qs = next.toString();
    const url = qs ? `/tasks?${qs}` : "/tasks";
    if (replace) router.replace(url);
    else router.push(url);
  }

  // Live search: filter as you type, debounced, without stacking browser history.
  const [q, setQ] = useState(current.q);
  useEffect(() => {
    if (q.trim() === current.q) return;
    const id = setTimeout(() => set("q", q.trim(), { replace: true }), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, current.q]);

  return (
    // Phone: search and status on one row, the two pickers on the next. From sm,
    // all in one row; the search and pickers shrink to fit, so it never scrolls sideways.
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-2 sm:contents">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title…"
          aria-label="Filter by title"
          className={`${field} min-w-0 flex-1 sm:max-w-64`}
        />
        <SegmentedControl
          aria-label="Status"
          size="md"
          options={STATUS_TABS}
          value={STATUS_TABS.some((t) => t.key === current.status) ? (current.status as (typeof STATUS_TABS)[number]["key"]) : "open"}
          onChange={(k) => set("status", k)}
          className="sm:ml-auto"
        />
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:contents">
        <Select
          value={current.owner}
          onChange={(e) => set("owner", e.target.value)}
          aria-label="Assignee"
          className={`${field} w-auto min-w-0 flex-1 sm:max-w-45`}
        >
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {owners.users.length > 0 && (
            <optgroup label="Team">
              {owners.users.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {owners.contacts.length > 0 && (
            <optgroup label="Contractors">
              {owners.contacts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {owners.external.length > 0 && (
            <optgroup label="External">
              {owners.external.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
        </Select>

        <Select
          value={current.property}
          onChange={(e) => set("property", e.target.value)}
          aria-label="Property"
          className={`${field} w-auto min-w-0 flex-1 sm:max-w-45`}
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {shortAddress(p.address)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
