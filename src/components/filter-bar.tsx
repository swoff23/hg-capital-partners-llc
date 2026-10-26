"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Check, Plus, SlidersHorizontal, X } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { OptionList, SEARCH_FROM, type OptionItem, type OptionSection } from "@/components/option-list";
import { Popover, PopoverTrigger } from "@/components/popover";
import { SearchInput } from "@/components/search-field";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { Sheet } from "@/components/sheet";
import { Switch } from "@/components/switch";
import { useRememberList } from "@/components/list-memory";
import { Badge, Button, buttonClass, chromeIconClass } from "@/components/ui";
import { LIST_PATHS, joinFacet, parseFacet, type ListKey } from "@/lib/list-memory";
import { cn } from "@/lib/utils";

/*
 * Filters and sorts for a list (docs/specs/selectors.md 3.6 and 3.7). One
 * bar per list, one shape:
 *
 *   <FilterScope list="tasks" defaults={{ status: "open" }}>
 *     <FilterBar noun={{ one: "task", many: "tasks" }} search={…} views={…} facets={…} wide="56rem" />
 *     <FilterResults>
 *       <ResultLine … />
 *       …the rows, rendered by the server page…
 *     </FilterResults>
 *   </FilterScope>
 *
 * The state lives in the URL: `router.replace` inside a transition, so no
 * toggle adds a history entry. The control moves first (an optimistic copy of
 * the query), and the rows dim to 50% with `aria-busy` while the server
 * answers. Each change is also remembered in the list's cookie, so the
 * sidebar link opens the list as it was left (lib/list-memory.ts).
 *
 * Wide, with a mouse and a bar as wide as the page's busiest row needs: the
 * search, the views and a chip per facet in one row. Everywhere else: the
 * search, the views and a Filters button that opens a sheet whose picks wait
 * for "Show 13 tasks". A container query picks between them, so nothing
 * flashes on load and the sidebar being pinned or not just works.
 */

/* ---------------- The scope ---------------- */

type Scope = {
  list: ListKey;
  /** The query as the control shows it: the URL's, with this transition's change already in. */
  query: URLSearchParams;
  /** The server is answering the last change. */
  pending: boolean;
  /** Sets or removes params in one change. A value of null, "" or the param's default removes it. */
  update: (changes: Record<string, string | null>) => void;
  /** Replaces the whole query: the Filters sheet's Show button. */
  apply: (next: URLSearchParams) => void;
  /** Back to the list's default: no params at all. */
  clear: () => void;
};

const ScopeContext = createContext<Scope | null>(null);

/** The list this control filters or sorts. Throws outside a `FilterScope`. */
export function useFilterScope(): Scope {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("A filter or sort control must sit inside a FilterScope.");
  return scope;
}

/**
 * Holds one list's query. `defaults` are the values the URL leaves out
 * ({ status: "open" }): picking one removes the param.
 */
export function FilterScope({
  list,
  defaults,
  children,
}: {
  list: ListKey;
  defaults?: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const remember = useRememberList();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(params.toString(), (_: string, next: string) => next);
  const query = useMemo(() => new URLSearchParams(shown), [shown]);

  const apply = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      startTransition(() => {
        setShown(qs);
        router.replace(qs ? `${LIST_PATHS[list]}?${qs}` : LIST_PATHS[list], { scroll: false });
      });
      remember(list, qs);
    },
    [list, remember, router, setShown],
  );

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(query);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "" || value === defaults?.[key]) next.delete(key);
        else next.set(key, value);
      }
      apply(next);
    },
    [apply, defaults, query],
  );

  const clear = useCallback(() => apply(new URLSearchParams()), [apply]);
  const value = useMemo(() => ({ list, query, pending, update, apply, clear }), [list, query, pending, update, apply, clear]);
  return <ScopeContext value={value}>{children}</ScopeContext>;
}

/** The rows under the bar: 50% and `aria-busy` while the server answers a change. */
export function FilterResults({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFilterScope();
  return (
    <div aria-busy={pending || undefined} className={cn("transition-opacity duration-fast", pending && "opacity-50", className)}>
      {children}
    </div>
  );
}

/** A button that changes the query: "Show 18 in All", "Clear search", "Clear filters". For an empty list's way out. */
export function ScopeButton({
  changes,
  clear = false,
  children,
}: {
  /** Params to set or remove; null removes. */
  changes?: Record<string, string | null>;
  /** Back to the list's default instead. */
  clear?: boolean;
  children: ReactNode;
}) {
  const scope = useFilterScope();
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => (clear ? scope.clear() : scope.update(changes ?? {}))}>
      {children}
    </Button>
  );
}

/**
 * Under the bar, above the first row, whenever the list isn't in its opening
 * state: "13 tasks · 27 hidden by filters · Clear filters". One line at every
 * width: below sm it reads "27 hidden". A list reopened with remembered filters
 * says so before its first row.
 */
export function ResultLine({
  shown,
  hidden,
  noun,
}: {
  shown: number;
  /** Rows the view holds that the filters leave out. */
  hidden: number;
  noun: { one: string; many: string };
}) {
  const { clear } = useFilterScope();
  return (
    <p className="mb-3 mt-3 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-meta text-fg-3">
      <span className="min-w-0 truncate tabular-nums">
        {shown.toLocaleString("en-US")} {shown === 1 ? noun.one : noun.many}
      </span>
      {hidden > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">
            {hidden.toLocaleString("en-US")} hidden<span className="max-sm:hidden"> by filters</span>
          </span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={clear}
        className={cn(
          "relative shrink-0 whitespace-nowrap text-fg-1 underline decoration-1 underline-offset-3 hover:decoration-2",
          // A 44px target on touch without making the line taller.
          "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3",
        )}
      >
        Clear filters
      </button>
    </p>
  );
}

/* ---------------- The bar ---------------- */

export type FilterView = {
  key: string;
  label: string;
  count?: number;
  /** A mark before the count (the Review ring in --warn). */
  mark?: ReactNode;
};

export type FilterFacet =
  | {
      kind: "multi";
      /** The URL param: comma-joined picks. */
      param: string;
      /** The chip's idle words and the sheet section's heading: "Assignee". */
      label: string;
      /** "Search people": the list's search field, from 10 options. */
      searchLabel: string;
      /** The one line when nothing matches: "No one matches." */
      emptyText: string;
      /** The empty choice, listed first ("Unassigned", "No property"). */
      pinned?: OptionItem[];
      items?: OptionItem[];
      sections?: OptionSection[];
    }
  | {
      kind: "toggle";
      /** The URL param: "1" while on. */
      param: string;
      /** "Has login", "Needs W-9", "Repeats". */
      label: string;
    };

export type FilterSort = {
  param: string;
  /** The sort the list opens in; it stays out of the URL. */
  default: string;
  /** The sorts as phrases, the default first (the phone's sheet lists them). */
  choices: readonly { value: string; label: string }[];
  /** The phrase for a sort the choices don't name, so a sort from a column header still shows as a row. */
  phrase?: (value: string) => string | null;
};

/** The container width at which a mouse gets chips instead of the Filters button. */
const WIDE = {
  "56rem": {
    show: "pointer-fine:@min-[56rem]:flex",
    inline: "pointer-fine:@min-[56rem]:inline-flex",
    hide: "pointer-fine:@min-[56rem]:hidden",
    search: "pointer-fine:@min-[56rem]:flex-[0_1_15rem] pointer-fine:@min-[56rem]:min-w-50",
  },
  "60rem": {
    show: "pointer-fine:@min-[60rem]:flex",
    inline: "pointer-fine:@min-[60rem]:inline-flex",
    hide: "pointer-fine:@min-[60rem]:hidden",
    search: "pointer-fine:@min-[60rem]:flex-[0_1_15rem] pointer-fine:@min-[60rem]:min-w-50",
  },
} as const;

export type FilterBarProps = {
  noun: { one: string; many: string };
  search?: { placeholder: string; param?: string };
  views?: {
    param: string;
    /** Names the group: "Status", "Deal view". */
    label: string;
    default: string;
    options: readonly FilterView[];
    /**
     * Beside the segments, which hold only in the wide bar, the compact bar
     * shows the views as a menu naming the current one, with this sheet title
     * on a phone (deals' six views).
     */
    menu?: { sheetTitle: string };
    /** Params that fall away when the view changes (a narrowing that belongs to the old view). */
    resets?: readonly string[];
  };
  facets?: readonly FilterFacet[];
  sort?: FilterSort;
  /** When a mouse gets chips: the container's width. Each page sets it from its longest state. */
  wide: keyof typeof WIDE;
  /** How many rows the list shows now: the Filters sheet's "Show 13 tasks" until a pick changes it. */
  shown?: number;
  /** How many rows a staged query leaves (a server action). Without it the sheet reads "Show tasks". */
  count?: (query: string) => Promise<number>;
  className?: string;
};

export function FilterBar({ noun, search, views, facets = [], sort, wide, shown, count, className }: FilterBarProps) {
  const scope = useFilterScope();
  const { query, update } = scope;
  const classes = WIDE[wide];
  const bar = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [staged, setStaged] = useState(() => new URLSearchParams());

  /* The search: typed text is local, the URL follows 250ms after the last key. */
  const searchParam = search?.param ?? "q";
  const urlText = query.get(searchParam) ?? "";
  const [text, setText] = useState(urlText);
  const [seenUrlText, setSeenUrlText] = useState(urlText);
  if (urlText !== seenUrlText) {
    setSeenUrlText(urlText);
    // Something else changed it (Clear filters, a way out of an empty list): the field follows. Our own typing is already in it.
    if (text.trim() !== urlText) setText(urlText);
  }
  useEffect(() => {
    if (!search || text.trim() === urlText) return;
    const id = setTimeout(() => update({ [searchParam]: text.trim() }), 250);
    return () => clearTimeout(id);
  }, [search, searchParam, text, urlText, update]);

  /* What's set: facets with a pick, toggles that are on, and a sort of its own. */
  const sorted = sort ? (query.get(sort.param) ?? sort.default) : null;
  const filterCount =
    facets.filter((f) => (f.kind === "multi" ? parseFacet(query.get(f.param)).length > 0 : query.get(f.param) === "1")).length +
    (sort && sorted !== sort.default ? 1 : 0);

  const view = views ? (query.get(views.param) ?? views.default) : null;
  function pickView(key: string) {
    if (!views) return;
    update({ [views.param]: key, ...Object.fromEntries((views.resets ?? []).map((p) => [p, null])) });
  }

  /* Backspace or Delete on a set chip takes it off and moves on to the next chip, or the search. */
  function focusAfter(current: HTMLElement) {
    const chips = Array.from(bar.current?.querySelectorAll<HTMLElement>("[data-chip-button]") ?? []);
    const at = chips.indexOf(current);
    (chips[at + 1] ?? searchInput.current)?.focus();
  }

  const hasSheet = facets.length > 0 || sort !== undefined;
  const viewSegments: SegmentOption<string>[] | null = views
    ? views.options.map((o) => ({ key: o.key, label: o.label, count: o.count, mark: o.mark }))
    : null;
  // A bar with views on a row of their own below sm: the search and Filters share row one.
  const phoneRows = Boolean(search && views && !views.menu);

  return (
    <div ref={bar} className={cn("@container", className)}>
      <div className={cn("flex items-center gap-2", phoneRows && "max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto]")}>
        {search && (
          <SearchInput
            size="sm"
            placeholder={search.placeholder}
            value={text}
            onChange={setText}
            onSubmit={() => update({ [searchParam]: text.trim() })}
            inputRef={searchInput}
            // Flexible in the compact bar; 240px in the wide one, giving way to 200 first.
            className={cn("min-w-0 flex-1", classes.search)}
          />
        )}

        {views && viewSegments && (
          <>
            <SegmentedControl
              aria-label={views.label}
              options={viewSegments}
              value={view}
              onChange={pickView}
              fullWidth={phoneRows ? "below-sm" : false}
              className={cn(phoneRows && "max-sm:order-last max-sm:col-span-2", views.menu && cn("hidden", classes.inline))}
            />
            {views.menu && (
              <ViewMenu
                label={views.label}
                options={views.options}
                value={view}
                sheetTitle={views.menu.sheetTitle}
                onPick={pickView}
                className={classes.hide}
              />
            )}
          </>
        )}

        {/* Wide, with a mouse: a chip per facet. The set chips give their words up before the row outgrows the bar. */}
        <div className={cn("hidden min-w-0 shrink items-center gap-2", classes.show)}>
          {facets.map((f) =>
            f.kind === "multi" ? (
              <FilterChip key={f.param} facet={f} onRemoved={focusAfter} />
            ) : (
              <ToggleChip key={f.param} facet={f} onRemoved={focusAfter} />
            ),
          )}
        </div>

        {/* Everywhere else: one Filters button. Beside a view menu it shrinks to the icon and the count below sm. */}
        {hasSheet && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={filterCount > 0 ? `Filters, ${filterCount} set` : "Filters"}
            onClick={() => {
              setStaged(new URLSearchParams(query));
              setSheetOpen(true);
            }}
            className={cn("shrink-0", views?.menu && "pointer-coarse:max-sm:min-w-11", classes.hide)}
          >
            <SlidersHorizontal aria-hidden="true" className={chromeIconClass} />
            <span className={cn(views?.menu && "max-sm:sr-only")}>Filters</span>
            {filterCount > 0 && <Badge className="num">{filterCount}</Badge>}
          </Button>
        )}
      </div>

      {hasSheet && (
        <FilterSheet
          isOpen={sheetOpen}
          onOpenChange={setSheetOpen}
          noun={noun}
          facets={facets}
          sort={sort}
          staged={staged}
          setStaged={setStaged}
          currentQuery={query.toString()}
          shown={shown}
          count={count}
          onApply={(next) => {
            setSheetOpen(false);
            scope.apply(next);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Views as a menu ---------------- */

/** The compact bar's views: a secondary button naming the current one, its count from sm up, and a chevron. */
function ViewMenu({
  label,
  options,
  value,
  sheetTitle,
  onPick,
  className,
}: {
  label: string;
  options: readonly FilterView[];
  value: string | null;
  sheetTitle: string;
  onPick: (key: string) => void;
  className?: string;
}) {
  const current = options.find((o) => o.key === value) ?? options[0];
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`${label}: ${current.label}`}
        className={cn(buttonClass({ variant: "secondary", size: "sm" }), "min-w-0 shrink-0", className)}
      >
        <span className="truncate">{current.label}</span>
        {current.count !== undefined && <span className="tabular-nums text-fg-3 max-sm:hidden">{current.count}</span>}
        <ChevronDown aria-hidden="true" className="size-3.5 text-fg-3" />
      </AriaButton>
      <Menu
        placement="bottom end"
        selectionMode="single"
        selectedKeys={value ? [value] : []}
        sheetTitle={sheetTitle}
        onAction={(key) => onPick(String(key))}
        aria-label={label}
      >
        {options.map((o) => (
          <MenuItem key={o.key} id={o.key} textValue={o.label}>
            {/* One flex-1 box, so the count rides the right edge beside the Check instead of splitting the room with it. */}
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="truncate">{o.label}</span>
              {o.count !== undefined && <span className="ml-auto tabular-nums text-fg-3">{o.count}</span>}
            </span>
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

/* ---------------- Chips (the wide bar) ---------------- */

const chipEdge = "inline-flex h-8 shrink-0 items-center rounded-md border bg-surface text-label outline-none";

/** The chip's words for its picks: one, two joined, or the first and how many more. */
export function chipValue(labels: readonly string[]): string {
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]} +${labels.length - 1}`;
}

/** Every row of a facet, in the order it lists them. */
function facetRows(f: Extract<FilterFacet, { kind: "multi" }>): OptionItem[] {
  return [...(f.pinned ?? []), ...(f.items ?? []), ...(f.sections ?? []).flatMap((s) => s.items)];
}

/**
 * A facet with several picks, as a chip. Idle: a solid --line-strong edge, a
 * Plus and the facet's name. Set: a --line-control edge, the name in --fg-2
 * and the picks in --fg-1, and an X of its own to take the filter off. Its
 * panel is the option list with checkboxes and counts, and it applies live:
 * no Apply, no Clear inside.
 */
function FilterChip({
  facet,
  onRemoved,
}: {
  facet: Extract<FilterFacet, { kind: "multi" }>;
  onRemoved: (chip: HTMLElement) => void;
}) {
  const { query, update } = useFilterScope();
  const picked = parseFacet(query.get(facet.param));
  const rows = facetRows(facet);
  const labels = picked.map((id) => rows.find((r) => r.id === id)?.label ?? id);
  const set = picked.length > 0;
  const main = useRef<HTMLButtonElement>(null);

  /** Takes the filter off and moves on, from the chip's own button whichever one asked. */
  function remove() {
    update({ [facet.param]: null });
    if (main.current) onRemoved(main.current);
  }
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (!set || (e.key !== "Backspace" && e.key !== "Delete")) return;
    e.preventDefault();
    remove();
  }

  return (
    <div className={cn(chipEdge, "min-w-0 shrink", set ? "border-line-control" : "border-line-strong")}>
      <PopoverTrigger>
        <AriaButton
          ref={main}
          data-chip-button=""
          onKeyDown={onKeyDown}
          aria-label={set ? `${facet.label}: ${labels.join(", ")}` : facet.label}
          className="flex h-full min-w-0 items-center gap-1.5 rounded-md px-2.5 outline-none transition-colors hover:bg-fill-1 data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-act data-pressed:bg-fill-1"
        >
          {!set && <Plus aria-hidden="true" className="size-3.5 shrink-0 text-fg-3" />}
          <span className="shrink-0 text-fg-2">{facet.label}</span>
          {set && <span className="min-w-10 max-w-40 truncate text-fg-1">{chipValue(labels)}</span>}
        </AriaButton>
        {/* The larger of the chip and the widest row, at most 320; a panel with a search field keeps room to type. */}
        <Popover
          aria-label={facet.label}
          placement="bottom start"
          motion="none"
          className={rows.length >= SEARCH_FROM ? "min-w-64 max-w-80" : "min-w-[min(var(--trigger-width),20rem)] max-w-80"}
        >
          <OptionList
            aria-label={facet.label}
            selectionMode="multiple"
            selectedKeys={picked}
            onSelectionChange={(ids) => update({ [facet.param]: joinFacet(ids) })}
            pinned={facet.pinned}
            items={facet.items}
            sections={facet.sections}
            searchLabel={facet.searchLabel}
            emptyText={facet.emptyText}
          />
        </Popover>
      </PopoverTrigger>
      {set && (
        <AriaButton
          aria-label={`Remove ${facet.label} filter`}
          onPress={remove}
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-3 outline-none transition-colors hover:bg-fill-2 hover:text-fg-1 data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:outline-act pointer-coarse:hidden"
        >
          <X aria-hidden="true" className="size-3.5" />
        </AriaButton>
      )}
    </div>
  );
}

/**
 * A yes or no facet as a chip ("Has login", "Repeats"): `aria-pressed`.
 * Idle, the solid --line-strong edge in --fg-2; pressed, a --line-control edge
 * with a Check in --fg-1 before the words.
 */
function ToggleChip({
  facet,
  onRemoved,
}: {
  facet: Extract<FilterFacet, { kind: "toggle" }>;
  onRemoved: (chip: HTMLElement) => void;
}) {
  const { query, update } = useFilterScope();
  const on = query.get(facet.param) === "1";
  return (
    <button
      type="button"
      data-chip-button=""
      aria-pressed={on}
      onClick={() => update({ [facet.param]: on ? null : "1" })}
      onKeyDown={(e) => {
        // Like a set chip: Backspace or Delete takes it off and focus moves on.
        if (!on || (e.key !== "Backspace" && e.key !== "Delete")) return;
        e.preventDefault();
        update({ [facet.param]: null });
        onRemoved(e.currentTarget);
      }}
      className={cn(
        chipEdge,
        "gap-1.5 px-2.5 text-fg-2 transition-colors hover:bg-fill-1 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-act",
        "border-line-strong aria-pressed:border-line-control aria-pressed:text-fg-1",
      )}
    >
      {on && <Check aria-hidden="true" className="size-3.5 shrink-0 text-fg-1" />}
      {facet.label}
    </button>
  );
}

/* ---------------- The Filters sheet (everywhere else) ---------------- */

/** How many rows a long facet shows before "Show all": the picked ones, and this many more. */
const SHEET_PREVIEW = 6;

/** Whether every typed word is somewhere in a row's words. */
function rowMatches(row: OptionItem, text: string): boolean {
  const hay = [row.label, row.searchText].filter(Boolean).join(" ").toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/**
 * One facet in the sheet: its heading, how many are picked, and a Clear while
 * any are. Up to 9 options list inline; from 10 there's a search (not focused
 * on open), the picked rows, the first 6 others and "Show all 32", which opens
 * in place.
 */
function FacetSection({
  facet,
  picked,
  onChange,
}: {
  facet: Extract<FilterFacet, { kind: "multi" }>;
  picked: string[];
  onChange: (ids: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const rows = facetRows(facet);
  const long = rows.length >= SEARCH_FROM;
  const searching = text.trim() !== "";
  const headingId = `filters-${facet.param}`;

  // Which rows show: everything for a short facet or "Show all"; matches while searching; otherwise the pinned rows, the picked and the first few.
  const others = rows.filter((r) => !picked.includes(r.id) && !(facet.pinned ?? []).some((p) => p.id === r.id));
  const preview = new Set([...(facet.pinned ?? []).map((p) => p.id), ...picked, ...others.slice(0, SHEET_PREVIEW).map((r) => r.id)]);
  const show = (r: OptionItem) => (!long || all ? true : searching ? rowMatches(r, text) : preview.has(r.id));
  const filtered = <T extends OptionItem>(list: T[] | undefined) => (searching ? list?.filter((r) => rowMatches(r, text)) : list?.filter(show));
  const sections = facet.sections?.map((s) => ({ ...s, items: filtered(s.items) ?? [] })).filter((s) => s.items.length > 0);
  const hiding = long && !all && !searching && rows.length > preview.size;

  return (
    <section aria-labelledby={headingId}>
      {/* As tall as Clear on touch before Clear appears, so a pick never moves the list. */}
      <div className="flex min-h-6 items-center justify-between gap-3 pl-3 pr-2 pb-1 pointer-coarse:min-h-11">
        <h3 id={headingId} className="flex items-baseline gap-1.5 text-meta font-medium text-fg-2">
          {facet.label}
          {picked.length > 0 && <span className="font-normal tabular-nums text-fg-3">{picked.length}</span>}
        </h3>
        {picked.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </div>
      {long && (
        <div className="px-1 pb-1">
          <SearchInput size="md" escape="layer" placeholder={facet.searchLabel} value={text} onChange={setText} />
        </div>
      )}
      <OptionList
        aria-label={facet.label}
        container="sheet"
        search={false}
        autoFocus={false}
        revealPicked={false}
        selectionMode="multiple"
        selectedKeys={picked}
        onSelectionChange={onChange}
        pinned={filtered(facet.pinned)}
        items={filtered(facet.items)}
        sections={sections}
        emptyText={facet.emptyText}
      />
      {hiding && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mx-1 flex h-8 w-[calc(100%-0.5rem)] items-center rounded-sm px-2 text-body text-fg-2 transition-colors hover:bg-fill-2 hover:text-fg-1 pointer-coarse:h-11"
        >
          Show all {rows.length}
        </button>
      )}
    </section>
  );
}

/**
 * The Filters sheet: a section per facet, a Switch row per yes or no facet,
 * and Sort last. Picks are staged: nothing changes until the primary at the
 * foot ("Show 13 tasks"); the X, Esc, a swipe down or a tap on the scrim
 * discards them. The count behind the button is asked of the server after
 * each pick (debounced 250ms, a newer pick dropping the older request) and
 * the button keeps its last number, dimmed, while it loads.
 */
function FilterSheet({
  isOpen,
  onOpenChange,
  noun,
  facets,
  sort,
  staged,
  setStaged,
  currentQuery,
  shown,
  count,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  noun: { one: string; many: string };
  facets: readonly FilterFacet[];
  sort?: FilterSort;
  staged: URLSearchParams;
  setStaged: (next: URLSearchParams) => void;
  currentQuery: string;
  shown?: number;
  count?: (query: string) => Promise<number>;
  onApply: (next: URLSearchParams) => void;
}) {
  const stagedQuery = staged.toString();
  // What the server last said for one set of picks; `n` is null when it couldn't say.
  const [answer, setAnswer] = useState<{ query: string; n: number | null } | null>(null);
  const request = useRef(0);

  // Ask the server how many rows these picks leave, once the picks have settled.
  useEffect(() => {
    if (!isOpen || !count || stagedQuery === currentQuery) return;
    const id = ++request.current;
    const timer = setTimeout(async () => {
      let n: number | null = null;
      try {
        n = await count(stagedQuery);
      } catch {
        // No number: the primary reads "Show tasks" and still applies the picks.
      }
      if (id === request.current) setAnswer({ query: stagedQuery, n });
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, count, stagedQuery, currentQuery]);

  // The count behind the button: the page's own while nothing is staged, the server's answer once it has one for
  // these picks, and meanwhile the last number, dimmed to 50% (brand section 7: a button keeps its label while it loads).
  const changed = stagedQuery !== currentQuery;
  const answered = answer?.query === stagedQuery;
  const loading = Boolean(count) && changed && !answered;
  const n = !changed ? (shown ?? null) : answered ? answer.n : (answer?.n ?? shown ?? null);
  const showLabel = n === null ? `Show ${noun.many}` : `Show ${n.toLocaleString("en-US")} ${n === 1 ? noun.one : noun.many}`;

  function setParam(param: string, value: string | null) {
    const next = new URLSearchParams(staged);
    if (value === null || value === "") next.delete(param);
    else next.set(param, value);
    setStaged(next);
  }
  const anyStaged =
    facets.some((f) => (f.kind === "multi" ? parseFacet(staged.get(f.param)).length > 0 : staged.get(f.param) === "1")) ||
    (sort ? staged.has(sort.param) : false);
  function clearAll() {
    const next = new URLSearchParams(staged);
    for (const f of facets) next.delete(f.param);
    if (sort) next.delete(sort.param);
    setStaged(next);
  }

  const toggles = facets.filter((f): f is Extract<FilterFacet, { kind: "toggle" }> => f.kind === "toggle");
  const sortValue = sort ? (staged.get(sort.param) ?? sort.default) : null;
  const sortChoices = sort
    ? [
        ...sort.choices,
        // A sort from a column header that the phrases don't list stays visible as its own row.
        ...(sortValue && !sort.choices.some((c) => c.value === sortValue) ? [{ value: sortValue, label: sort.phrase?.(sortValue) ?? sortValue }] : []),
      ]
    : [];

  return (
    <Sheet
      title="Filters"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      footer={
        <div className="flex items-center justify-between gap-3">
          {anyStaged ? (
            <Button type="button" variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            aria-busy={loading || undefined}
            onClick={() => onApply(staged)}
            className={cn("min-w-0", loading && "opacity-50")}
          >
            <span className="truncate tabular-nums">{showLabel}</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-2 pt-3">
        {facets.map((f) =>
          f.kind === "multi" ? (
            <FacetSection
              key={f.param}
              facet={f}
              picked={parseFacet(staged.get(f.param))}
              onChange={(ids) => setParam(f.param, joinFacet(ids))}
            />
          ) : null,
        )}
        {toggles.length > 0 && (
          <div>
            {toggles.map((f) => (
              <Switch
                key={f.param}
                label={f.label}
                className="px-3"
                isSelected={staged.get(f.param) === "1"}
                onChange={(on) => setParam(f.param, on ? "1" : null)}
              />
            ))}
          </div>
        )}
        {sort && (
          <section aria-labelledby="filters-sort">
            <h3 id="filters-sort" className="px-3 pb-1 text-meta font-medium text-fg-2">
              Sort
            </h3>
            <OptionList
              aria-label="Sort"
              container="sheet"
              search={false}
              autoFocus={false}
              revealPicked={false}
              selectedKey={sortValue}
              onPick={(value) => setParam(sort.param, value === sort.default ? null : value)}
              items={sortChoices.map((c) => ({ id: c.value, label: c.label, muted: !sort.choices.some((x) => x.value === c.value) }))}
            />
          </section>
        )}
      </div>
    </Sheet>
  );
}
