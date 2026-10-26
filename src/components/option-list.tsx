"use client";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  Autocomplete,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  useFilter,
  type Key,
  type Selection,
} from "react-aria-components";
import { SearchInput } from "@/components/search-field";
import { CheckboxMark, tagClass } from "@/components/ui";
import { isCoarseNow } from "@/components/use-coarse-pointer";
import { cn } from "@/lib/utils";

/**
 * The list inside every select, picker, filter panel and repeat menu
 * (docs/specs/selectors.md 3.1): an optional search field on top, optional
 * pinned rows (the empty choice), then sections with headers. One shape in a
 * popover and in a sheet, so a pick looks the same wherever it opens.
 *
 *   <OptionList aria-label="People" pinned={[none]} sections={sections}
 *     selectedKey="u:abc" onPick={(id) => …} searchLabel="Search people" />
 *
 * Pick one commits and the caller closes; pick many toggles and stays open.
 * Search turns on by itself from 10 options (`search="auto"`), as arrows move
 * the highlight while the caret stays in the field and the first match is
 * ready for Enter. Esc closes the layer in one press, with the text in it.
 */

/** One row. `id` is its key. */
export type OptionItem = {
  id: string;
  /** The row's title, one line. */
  label: string;
  /** More words search matches: an email, a trade, the full address. */
  searchText?: string;
  /** One line of text-meta --fg-3 under the title. */
  description?: ReactNode;
  /** The visual before the title: an Avatar, a StatusMark, a PhotoThumb 32, a lucide icon. */
  leading?: ReactNode;
  /** A neutral Tag after the title ("Has login"). */
  tag?: string;
  /** A tabular count at the trailing edge (filters). A zero stays listed, in --fg-3. */
  count?: number;
  /** Replaces the trailing Check: a chevron on a row that opens a step ("Custom"). */
  trailing?: ReactNode;
  /** The title in --fg-3: the empty choice and a stored value the list no longer offers. */
  muted?: boolean;
  /** Words after the title in --fg-3 that stay whole when the title truncates: "(you)". */
  suffix?: string;
  /**
   * A second row for a pick that has another (a Recent row): it shows the
   * Check when that pick does, and picking it picks that id. Give it its own
   * `id`; keys stay unique.
   */
  alias?: string;
  /** Shown only while the search is empty: the Recent rows, which would double every match. */
  whenSearchEmpty?: boolean;
  isDisabled?: boolean;
};

export type OptionSection = { id: string; title?: string; items: OptionItem[] };

type Common = {
  /** Rows before the sections: the empty choice ("Unassigned", "No property"). */
  pinned?: OptionItem[];
  /** Rows with no section header. */
  items?: OptionItem[];
  sections?: OptionSection[];
  /** Names the list for screen readers. */
  "aria-label": string;
  /** "Search people": the search field's placeholder and name. */
  searchLabel?: string;
  /** "auto" (the default) shows the search from 10 options. */
  search?: boolean | "auto";
  /** The one line when nothing matches: "No one matches." */
  emptyText?: string;
  /** Where the list sits: a sheet's body scrolls itself and pins the search under the title; a popover's list scrolls under a capped height. */
  container?: "popover" | "sheet";
  /** Move focus to the search (or the list) on open. Defaults to a mouse only, so a phone's keyboard stays down. */
  autoFocus?: boolean;
  /**
   * Scroll the picked row to the middle on open (the default). A sheet that
   * stacks several lists (the Filters sheet) turns it off, so opening it
   * starts at the top and not at the last list's pick.
   */
  revealPicked?: boolean;
  /** Tab leaves the list: the layer closes and focus goes back to its trigger. */
  onTab?: () => void;
  className?: string;
};

type Single = { selectionMode?: "single"; selectedKey: string | null; onPick: (id: string) => void };
type Many = { selectionMode: "multiple"; selectedKeys: readonly string[]; onSelectionChange: (ids: string[]) => void };

export type OptionListProps = Common & (Single | Many);

/** Search starts at this many options. */
export const SEARCH_FROM = 10;

/** The number of rows across pinned, items and sections. */
export function countOptions({ pinned, items, sections }: Pick<Common, "pinned" | "items" | "sections">): number {
  return (pinned?.length ?? 0) + (items?.length ?? 0) + (sections ?? []).reduce((n, s) => n + s.items.length, 0);
}

/** What the Autocomplete filter sees for a row that shows only while the search is empty: a prefix no typed word contains. */
const EMPTY_ONLY = "\u0000";

/** Whether a row matches typed words: every word must appear somewhere in it, in any order ("tamarack 56" finds "56 Tamarack St"). */
export function matchesAllWords(text: string, input: string, contains: (text: string, part: string) => boolean): boolean {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (text.startsWith(EMPTY_ONLY)) return words.length === 0;
  return words.every((w) => contains(text, w));
}

/** The nearest ancestor that scrolls vertically. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}

const rowClass = (twoLines: boolean) =>
  cn(
    "flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1 text-body outline-none",
    twoLines ? "min-h-11 pointer-coarse:min-h-14" : "min-h-8 pointer-coarse:min-h-11",
    "data-focused:bg-fill-2 data-pressed:bg-fill-2 data-disabled:opacity-50",
    // On touch only a keyboard focus draws the highlight, so opening a list doesn't paint its first or picked row.
    "pointer-coarse:data-focused:bg-transparent pointer-coarse:data-focus-visible:bg-fill-2 pointer-coarse:data-pressed:bg-fill-2",
  );
const headerClass = "px-2 pb-1 pt-2.5 text-meta font-medium text-fg-3";

/**
 * One row of an option list: a ListBoxItem with the checkbox (pick many), the
 * visual, the title over its subline, a Tag, a count and the trailing Check
 * (pick one). Exported for the Combobox, whose list is the same rows.
 */
export function OptionRow({ option: o, multiple = false }: { option: OptionItem; multiple?: boolean }) {
  return (
    <ListBoxItem
      id={o.id}
      textValue={(o.whenSearchEmpty ? EMPTY_ONLY : "") + [o.label, o.searchText].filter(Boolean).join(" ")}
      isDisabled={o.isDisabled}
      className={rowClass(o.description !== undefined)}
    >
      {({ isSelected }) => (
        <>
          {multiple && <CheckboxMark checked={isSelected} />}
          {o.leading && <span className="flex shrink-0 items-center">{o.leading}</span>}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-1">
              <span className={cn("truncate", (o.muted || o.count === 0) && "text-fg-3")}>{o.label}</span>
              {o.suffix && <span className="shrink-0 text-fg-3">{o.suffix}</span>}
            </span>
            {o.description !== undefined && (
              <span className="block truncate text-meta text-fg-3">
                {o.description}
                {/* At 320 the Tag has no room beside the name: it joins the subline. */}
                {o.tag && <span className="hidden max-[360px]:inline"> · {o.tag}</span>}
              </span>
            )}
          </span>
          {o.tag && <span className={cn(tagClass, o.description !== undefined && "max-[360px]:hidden")}>{o.tag}</span>}
          {o.count !== undefined && <span className="shrink-0 text-meta tabular-nums text-fg-3">{o.count}</span>}
          {o.trailing ??
            (!multiple && <Check aria-hidden="true" className={cn("size-4 shrink-0 text-fg-1", !isSelected && "invisible")} />)}
        </>
      )}
    </ListBoxItem>
  );
}

export function OptionList(props: OptionListProps) {
  const {
    pinned,
    items,
    sections,
    searchLabel = "Search",
    search = "auto",
    emptyText = "Nothing matches.",
    container = "popover",
    autoFocus,
    revealPicked = true,
    onTab,
    className,
  } = props;
  const multiple = props.selectionMode === "multiple";
  const { contains } = useFilter({ sensitivity: "base" });
  const searchable = search === true || (search === "auto" && countOptions(props) >= SEARCH_FROM);
  // A mouse starts typing at once; touch leaves the keyboard down until asked.
  const focusOnOpen = autoFocus ?? !isCoarseNow();

  const rows = [...(pinned ?? []), ...(items ?? []), ...(sections ?? []).flatMap((x) => x.items)];
  const aliasOf = new Map(rows.filter((o) => o.alias).map((o) => [o.id, o.alias!]));
  const picked = multiple ? props.selectedKeys : props.selectedKey === null ? [] : [props.selectedKey];
  // A Recent row is picked when the pick it stands for is.
  const selected = [...picked, ...rows.filter((o) => o.alias && picked.includes(o.alias)).map((o) => o.id)];
  const rootRef = useRef<HTMLDivElement>(null);

  // The panel's width is set when it opens and held while you type, so it doesn't jitter.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el && container === "popover") el.style.minWidth = `${el.offsetWidth}px`;
  }, [container]);

  // Opening scrolls the picked row into view, centered in whatever scrolls (the popover's list, or the sheet's body).
  // React Aria renders the rows a frame after the list mounts, and the layer sizes itself in that frame too,
  // so look for the row each frame until it's there and measure once it is.
  useEffect(() => {
    if (!revealPicked) return;
    let frame = 0;
    let tries = 0;
    const scrollToPicked = () => {
      const row = rootRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      if (!row) {
        if (++tries < 30) frame = requestAnimationFrame(scrollToPicked);
        return;
      }
      const scroller = scrollParent(row);
      if (!scroller) return;
      const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, offset - scroller.clientHeight / 2 + row.offsetHeight / 2);
    };
    frame = requestAnimationFrame(scrollToPicked);
    return () => cancelAnimationFrame(frame);
  }, [container, revealPicked]);

  function onSelectionChange(keys: Selection) {
    if (keys === "all") return;
    const ids = [...keys].map((k) => aliasOf.get(String(k)) ?? String(k));
    if (props.selectionMode === "multiple") return props.onSelectionChange([...new Set(ids)]);
    // Tapping the current pick toggles it off in React Aria: treat that as picking it again.
    const next = ids[0] ?? props.selectedKey;
    if (next !== null && next !== undefined) props.onPick(next);
  }

  const list = (
    <ListBox
      aria-label={props["aria-label"]}
      selectionMode={multiple ? "multiple" : "single"}
      selectedKeys={selected as Iterable<Key>}
      onSelectionChange={onSelectionChange}
      shouldFocusOnHover
      // Esc closes the layer and nothing else: React Aria would also clear a pick-many list's selection,
      // which in a filter panel would take the filter off (selectors 3.7: Esc never clears a filter).
      escapeKeyBehavior="none"
      autoFocus={searchable ? undefined : focusOnOpen}
      renderEmptyState={() => <p className="px-2 py-3 text-body text-fg-3">{emptyText}</p>}
      className={cn(
        "p-1 outline-none",
        // A popover's list scrolls under a 320px panel (60dvh on touch); a sheet's body scrolls itself.
        container === "popover" && "min-h-0 flex-1 overflow-y-auto",
      )}
    >
      {pinned?.map((o) => <OptionRow key={o.id} option={o} multiple={multiple} />)}
      {items?.map((o) => <OptionRow key={o.id} option={o} multiple={multiple} />)}
      {sections?.map((s) => (
        <ListBoxSection key={s.id} id={s.id}>
          {s.title && <Header className={headerClass}>{s.title}</Header>}
          {s.items.map((o) => <OptionRow key={o.id} option={o} multiple={multiple} />)}
        </ListBoxSection>
      ))}
    </ListBox>
  );

  return (
    <div
      ref={rootRef}
      onKeyDownCapture={(e) => {
        if (e.key === "Tab" && onTab) {
          e.preventDefault();
          onTab();
        }
      }}
      className={cn(
        "flex flex-col",
        container === "popover" && "max-h-80 pointer-coarse:max-h-[60dvh]",
        className,
      )}
    >
      {searchable ? (
        <Autocomplete filter={(text, input) => matchesAllWords(text, input, contains)}>
          <div
            className={cn(
              "shrink-0 border-b border-line p-1",
              // Pinned under the sheet's title while the rows scroll.
              container === "sheet" && "sticky top-0 z-10 bg-raised",
            )}
          >
            <SearchInput variant="bare" placeholder={searchLabel} aria-label={searchLabel} autoFocus={focusOnOpen} />
          </div>
          {list}
        </Autocomplete>
      ) : (
        list
      )}
    </div>
  );
}
