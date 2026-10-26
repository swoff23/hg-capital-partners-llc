"use client";
import {
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChartColumn,
  ClipboardList,
  House,
  Plus,
  Search,
  Settings2,
  SquareCheckBig,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  Autocomplete,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  ListStateContext,
  RouterProvider,
} from "react-aria-components";
import { Avatar } from "@/components/avatar";
import { DealStageMark } from "@/components/deal-stage";
import { useLeaveGuard } from "@/components/leave-guard";
import { Money } from "@/components/money";
import { PhotoThumb } from "@/components/photo-thumb";
import { SearchInput } from "@/components/search-field";
import { Sheet } from "@/components/sheet";
import { StatusMark, STATUS_TONE } from "@/components/status-badge";
import { Button, Kbd, LinkButton, chromeIconClass, fieldClass, fieldSizeClass, tagClass } from "@/components/ui";
import { isCoarseNow, useCoarsePointer } from "@/components/use-coarse-pointer";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import type { Command, CommandIcon } from "@/lib/commands";
import { pageContext } from "@/lib/commands";
import { dayLabel, todayYmdEastern, type Ymd } from "@/lib/dates";
import { dealStageLabel } from "@/lib/config";
import { withNext } from "@/lib/next-path";
import { matchRanges } from "@/lib/search";
import {
  addDealLabel,
  bandLabel,
  composePanel,
  seeAllLabel,
  seeElsewhereLabel,
  type PanelEntry,
  type PanelGroup,
  type PanelView,
} from "@/lib/search-panel";
import {
  MIN_QUERY,
  type RecentResponse,
  type SearchResponse,
  type SearchRow as SearchRowData,
  type SearchType,
} from "@/lib/search-results";
import { STATUS_LABEL } from "@/lib/task-scope";
import { cn } from "@/lib/utils";

/**
 * Search and jump (docs/specs/search.md 2.1 to 2.8). One body, SearchPanel,
 * in a Sheet with layout="palette": a floating panel from md (centered on a
 * computer, hung under the app bar on a tablet) and the whole screen on a
 * phone. SearchTrigger is the field-look button in the header that opens it,
 * and CommandPalette owns the open state and the keys that open it (Cmd+K,
 * Ctrl+K and "/"). The state each moment shows is composed in
 * lib/search-panel.ts, and what the server answers in lib/search-results.ts.
 */

/** Wait this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 180;

/* ---------------- The trigger ---------------- */

/**
 * The header's search: a field-look button reading "Search" with the shortcut
 * at its right (the keycap hides on touch). On touch, the press first focuses
 * a hidden input so iOS raises the keyboard inside the tap; the panel's own
 * input takes focus as it mounts and the keyboard stays up. That is a known
 * web workaround, not a documented API, so it needs a check on a real iPhone
 * and iPad.
 */
export function SearchTrigger({ onOpen }: { onOpen: (opener: HTMLElement) => void }) {
  const mod = useModKey();
  const coarse = useCoarsePointer();
  const proxy = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K /"
        // Safari's default Tab skips a plain button; a field it always reaches, and this stands where a field stood.
        tabIndex={0}
        onClick={(e) => {
          if (isCoarseNow()) proxy.current?.focus();
          onOpen(e.currentTarget);
        }}
        className={cn(
          fieldClass,
          fieldSizeClass.md,
          // A field has no hover. Its focus ring is for the keyboard: a click returns focus here after the panel closes.
          "relative flex items-center gap-2 pl-8 pr-2 text-left text-body text-fg-3 pointer-coarse:pl-9",
          "focus:border-line-control focus:ring-0 focus-visible:border-act focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-act",
        )}
      >
        <Search
          aria-hidden="true"
          className={cn(chromeIconClass, "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3")}
        />
        <span className="min-w-0 flex-1 truncate">Search</span>
        <Kbd aria-hidden="true">{shortcutLabel(mod, "K")}</Kbd>
      </button>
      {coarse && (
        <input
          ref={proxy}
          aria-hidden="true"
          tabIndex={-1}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          className="pointer-events-none fixed left-0 top-0 size-11 opacity-0"
          // 16px, so iOS doesn't zoom the page when it takes focus.
          style={{ fontSize: 16 }}
        />
      )}
    </>
  );
}

/* ---------------- The container and its keys ---------------- */

/** Whether keys typed here are text: a field, a select or an editable region. */
function typesText(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** A sheet, dialog, popover or menu is open: one layer at a time, so the shortcuts wait. */
function anotherLayerOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/**
 * Mounted once by the app shell. Cmd+K and Ctrl+K open the palette from
 * anywhere, a field included, and close it again; "/" opens it when focus
 * isn't in a field. Both do nothing while another layer is open or while
 * `suspended` (the phone drawer). `onBeforeOpen` runs just before it opens:
 * the shell closes the phone drawer there.
 */
export function CommandPalette({ suspended = false, onBeforeOpen }: { suspended?: boolean; onBeforeOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  // What the key handler reads, so two quick presses see each other before React has rendered between them.
  const isOpen = useRef(false);
  // Where focus goes back to when it closes: what had it, or the trigger that was pressed (Safari doesn't focus a pressed button).
  const opener = useRef<HTMLElement | null>(null);

  const show = useCallback(
    (from?: HTMLElement | null) => {
      const active = document.activeElement;
      opener.current = from ?? (active instanceof HTMLElement && active !== document.body ? active : null);
      onBeforeOpen?.();
      isOpen.current = true;
      setOpen(true);
    },
    [onBeforeOpen],
  );

  const changed = useCallback((next: boolean) => {
    isOpen.current = next;
    setOpen(next);
    if (next) return;
    // A modal opened without a trigger of its own doesn't give focus back, so this does.
    const back = opener.current;
    opener.current = null;
    requestAnimationFrame(() => {
      // Unless something outside the palette has taken focus since: a row that opened a page puts it on that page's heading.
      const taken = document.activeElement;
      if (taken && taken !== document.body && !taken.closest('[role="dialog"]')) return;
      if (back?.isConnected) back.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typesText(e.target);
      if (!mod && !slash) return;
      if (isOpen.current) {
        // Cmd+K again closes it; a "/" is just a character in the field.
        if (mod) {
          e.preventDefault();
          changed(false);
        }
        return;
      }
      if (suspended || anotherLayerOpen()) return;
      e.preventDefault();
      show();
    }
    // In the capture phase: a field inside the palette stops the keys it handles before they bubble up to the document.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [suspended, show, changed]);

  // Recent is held for the session, one person's: it goes when the shell does (sign-out).
  useEffect(
    () => () => {
      recentCache = null;
    },
    [],
  );

  return (
    <>
      <SearchTrigger onOpen={show} />
      <Sheet layout="palette" title="Search" hideTitle isOpen={open} onOpenChange={changed}>
        {({ close }) => <SearchPanel close={close} />}
      </Sheet>
    </>
  );
}

/* ---------------- Reading the server ---------------- */

type Live = {
  /** What the answer is for: the typed words and the type narrowed to. */
  q: string;
  scope: SearchType | null;
  status: "idle" | "ready" | "error" | "signed-out";
  response: SearchResponse | null;
};

const IDLE: Live = { q: "", scope: null, status: "idle", response: null };

/**
 * /api/search for the typed words, 180ms after the last key. The rows already
 * on screen stay until the new ones arrive, an older request is aborted so a
 * late answer never shows, and a failure clears the rows. Narrowing to a type
 * asks at once.
 */
function useLiveSearch(q: string, scope: SearchType | null) {
  const [live, setLive] = useState<Live>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const enough = q.length >= MIN_QUERY;
  const lastQ = useRef(q);

  useEffect(() => {
    if (!enough) return;
    const controller = new AbortController();
    // Typing waits for a pause; narrowing to a type, and Retry, ask at once.
    const delay = lastQ.current === q && attempt === 0 ? 0 : DEBOUNCE_MS;
    lastQ.current = q;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (scope) params.set("type", scope);
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (res.status === 401) return setLive({ q, scope, status: "signed-out", response: null });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setLive({ q, scope, status: "ready", response: (await res.json()) as SearchResponse });
      } catch {
        if (!controller.signal.aborted) setLive({ q, scope, status: "error", response: null });
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, scope, enough, attempt]);

  const current = enough && live.q === q && live.scope === scope;
  // Rows for older words stay while the new ones load (never across a change of type); an old failure doesn't.
  const showing: Live = current ? live : enough && live.status === "ready" && live.scope === scope ? live : IDLE;
  return {
    live: showing,
    pending: enough && !current,
    retry: () => {
      setLive(IDLE);
      setAttempt((n) => n + 1);
    },
  };
}

/** The Recent rows, held in memory for the session so a reopen is instant; each open refreshes them. */
let recentCache: SearchRowData[] | null = null;

function useRecent() {
  const [rows, setRows] = useState<SearchRowData[] | null>(recentCache);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/search/recent", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = ((await res.json()) as RecentResponse).rows;
        recentCache = next;
        setRows(next);
      } catch {
        // No recents to show: the panel says what is searchable instead.
        if (!controller.signal.aborted) setRows((had) => had ?? []);
      }
    })();
    return () => controller.abort();
  }, []);
  return rows;
}

/** Below md: the phone's full-screen layout (the same breakpoint the Sheet switches at). */
function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 48rem)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => !window.matchMedia("(min-width: 48rem)").matches,
    () => false,
  );
}

/* ---------------- The panel ---------------- */

/**
 * The body every container shares: the input, the rows and the footer. The
 * input keeps focus and the list takes virtual focus (React Aria
 * Autocomplete), so the arrows and Enter work without moving focus. Every row
 * is a real link; Esc closes the layer in one press.
 */
export function SearchPanel({ close }: { close: () => void }) {
  const router = useRouter();
  const guard = useLeaveGuard();
  const pathname = usePathname();
  const coarse = useCoarsePointer();
  const phone = usePhoneLayout();
  const mod = useModKey();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchType | null>(null);
  const q = query.trim();
  const recent = useRecent();
  const { live, pending, retry } = useLiveSearch(q, scope);
  const [today] = useState<Ymd>(() => todayYmdEastern());

  const view = composePanel({
    q,
    scope,
    recent: { rows: recent ?? [], loaded: recent !== null },
    live: { status: live.status, response: live.response },
    context: pageContext(pathname),
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // New rows start at the top.
  const shown = `${q}|${scope ?? ""}|${live.status}|${live.q}`;
  const listKey = `${scope ?? ""}|${live.q}|${live.status}|${q.length < MIN_QUERY ? q : ""}`;
  // The set of rows the mouse last moved over. Rows that arrive under a still pointer (after "See all", say)
  // don't take the highlight from the first row until the mouse moves again.
  const [movedOver, setMovedOver] = useState<string | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [shown]);

  // A plain click or Enter on a row: close the palette, then go, asking first if the page holds something unsaved.
  const navigate = useCallback(
    (href: string) => {
      close();
      guard(() => router.push(href));
    },
    [close, guard, router],
  );

  /**
   * Puts the on-screen keyboard away: focus moves to the list, which is inside the dialog (blurring
   * the field alone would hand focus straight back to it, since the dialog keeps focus in itself)
   * and isn't a text field.
   */
  function dropKeyboard() {
    if (coarse && document.activeElement === inputRef.current) listRef.current?.focus({ preventScroll: true });
  }

  return (
    <RouterProvider navigate={navigate}>
      <Autocomplete disableAutoFocusFirst={coarse}>
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-line",
            phone ? "h-14 gap-2 px-4" : "h-12 pointer-coarse:h-14",
          )}
        >
          <SearchInput
            variant={phone ? "field" : "bare"}
            escape="layer"
            placeholder={phone ? "Search" : "Search or jump to"}
            value={query}
            onChange={setQuery}
            // The keyboard's Search key has no row to open on touch, so it puts the keyboard away and shows every row.
            onSubmit={dropKeyboard}
            onKeyDown={(e) => {
              // Backspace on an empty input steps back out of a narrowed type.
              if (e.key === "Backspace" && query === "" && scope) setScope(null);
            }}
            pending={pending}
            autoFocus
            tabbableClear
            inputRef={inputRef}
            className={phone ? undefined : "h-full"}
            // The icon centers on the rows' 32px leading slot, and the text starts on their title edge.
            iconClassName={phone ? "left-1.5" : "left-5 pointer-coarse:left-4.5"}
            inputClassName={phone ? undefined : "h-12 pl-14 pointer-coarse:h-14 pointer-coarse:pl-14"}
          />
          {phone && (
            <Button variant="ghost" size="sm" onClick={close} className="shrink-0 pointer-coarse:w-18">
              Cancel
            </Button>
          )}
        </div>

        {scope && view.band && (
          <ScopeBand type={scope} total={view.band.total} onBack={() => setScope(null)} />
        )}

        <div
          ref={listRef}
          // Focusable by script only: where focus rests once the keyboard is put away.
          tabIndex={-1}
          // The first drag in the list puts the keyboard away, as native lists do.
          onTouchMove={dropKeyboard}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" && (e.movementX !== 0 || e.movementY !== 0)) setMovedOver(listKey);
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none md:max-h-[min(60vh,480px)] md:pointer-coarse:max-h-none"
        >
          <PanelBody
            view={view}
            q={q}
            listKey={listKey}
            hover={movedOver === listKey}
            coarse={coarse}
            today={today}
            onScope={setScope}
            onRetry={retry}
            signInHref={signInHref(pathname)}
          />
        </div>
      </Autocomplete>

      <Footer mod={mod} />
      <div role="status" aria-live="polite" className="sr-only">
        {view.announce}
      </div>
    </RouterProvider>
  );
}

/** /login, and back to this page after. */
function signInHref(pathname: string): string {
  return withNext("/login", typeof window === "undefined" ? pathname : window.location.pathname + window.location.search);
}

const bandClass =
  "flex h-9 shrink-0 items-center justify-between gap-3 px-3 pointer-coarse:h-11 max-md:px-4";

/** After "See all": back to the groups on the left, how many of the type on the right. */
function ScopeBand({ type, total, onBack }: { type: SearchType; total: number | null; onBack: () => void }) {
  return (
    <div className={bandClass}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-meta font-medium text-fg-2 hover:text-fg-1 hover:underline pointer-coarse:min-h-11"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
        All results
      </button>
      {/* With none, the notice under the band says so. */}
      {total !== null && total > 0 && <span className="text-meta tabular-nums text-fg-3">{bandLabel(type, total)}</span>}
    </div>
  );
}

/** The key hints. A computer only: touch has the buttons, and a phone has no room. */
function Footer({ mod }: { mod: string }) {
  const hints: [string, string][] = [
    ["↑↓", "Move"],
    ["↵", "Open"],
    [mod === "⌘" ? "⌘↵" : "Ctrl ↵", "New tab"],
    ["Esc", "Close"],
  ];
  return (
    <div className="hidden h-9 shrink-0 items-center gap-4 border-t border-line px-3 text-meta text-fg-3 md:flex pointer-coarse:hidden">
      {hints.map(([keys, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <Kbd>{keys}</Kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

/* ---------------- The list ---------------- */

const noticeClass = "px-3 py-3 text-body text-fg-3 max-md:px-4";

function PanelBody({
  view,
  q,
  listKey,
  hover,
  coarse,
  today,
  onScope,
  onRetry,
  signInHref: signIn,
}: {
  view: PanelView;
  q: string;
  /** Changes with each new set of rows: the highlight goes back to the first row. */
  listKey: string;
  /** The mouse has moved since these rows arrived, so the row under it takes the highlight. */
  hover: boolean;
  coarse: boolean;
  today: Ymd;
  onScope: (type: SearchType) => void;
  onRetry: () => void;
  signInHref: string;
}) {
  const { notice, skeleton } = view;
  // With a mouse the first row holds the highlight; touch waits for an arrow key.
  const first = coarse ? undefined : view.groups.find((g) => g.entries.length > 0)?.entries[0].key;
  return (
    <>
      {notice && (
        <div className={cn(noticeClass, "flex items-center justify-between gap-3")}>
          <p className={cn("min-w-0", notice.kind === "hint" && "text-meta")}>{notice.text}</p>
          {notice.kind === "error" && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {notice.kind === "signed-out" && (
            <LinkButton href={signIn} variant="primary" size="sm">
              Sign in
            </LinkButton>
          )}
        </div>
      )}
      {skeleton?.title && <SkeletonRows rows={skeleton.rows} title={skeleton.title} />}
      <ListBox
        // One list for the whole panel: the Autocomplete listens on it for the highlighted row, and a remount
        // could leave the input pointing at a row that is gone. The first row takes the highlight itself
        // (HighlightFirst), with a mouse; touch waits for an arrow key.
        aria-label="Search results"
        selectionMode="none"
        shouldFocusWrap
        shouldFocusOnHover={hover}
        escapeKeyBehavior="none"
        renderEmptyState={() => null}
        className="p-1 outline-none max-md:p-2"
      >
        {view.groups.map((g) => (
          <PanelSection key={g.id} group={g} q={q} today={today} onScope={onScope} highlight={first} token={listKey} />
        ))}
      </ListBox>
      {skeleton && !skeleton.title && <SkeletonRows rows={skeleton.rows} />}
    </>
  );
}

const headerClass = "sticky top-0 z-10 flex h-7 items-center bg-raised px-2 text-meta font-medium text-fg-3";

function PanelSection({
  group,
  q,
  today,
  onScope,
  highlight,
  token,
}: {
  group: PanelGroup;
  q: string;
  today: Ymd;
  onScope: (type: SearchType) => void;
  /** The key of the row that takes the highlight, when it is in this group. */
  highlight: string | undefined;
  token: string;
}) {
  return (
    <ListBoxSection id={group.id}>
      {group.title && <Header className={headerClass}>{group.title}</Header>}
      {group.entries.map((entry) => (
        <Entry
          key={entry.key}
          entry={entry}
          q={q}
          today={today}
          onScope={onScope}
          highlight={entry.key === highlight ? token : undefined}
        />
      ))}
    </ListBoxSection>
  );
}

function Entry({
  entry,
  q,
  today,
  onScope,
  highlight,
}: {
  entry: PanelEntry;
  q: string;
  today: Ymd;
  onScope: (type: SearchType) => void;
  highlight: string | undefined;
}) {
  switch (entry.kind) {
    case "row":
      return (
        <SearchRow
          id={entry.key}
          href={entry.row.href}
          parts={rowParts(entry.row, entry.marked ? q : "", today)}
          highlight={highlight}
        />
      );
    case "command":
      return <SearchRow id={entry.key} href={entry.command.href} parts={commandParts(entry.command)} highlight={highlight} />;
    case "all":
      return (
        <SearchRow
          id={entry.key}
          onAction={() => onScope(entry.type)}
          parts={plainParts(seeAllLabel(entry.type, entry.total), { quiet: true })}
          highlight={highlight}
        />
      );
    case "elsewhere":
      return (
        <SearchRow
          id={entry.key}
          onAction={() => onScope(entry.type)}
          parts={plainParts(seeElsewhereLabel(entry.type, entry.total), { quiet: true })}
          highlight={highlight}
        />
      );
    case "open":
      return <SearchRow id={entry.key} href={entry.href} parts={plainParts(entry.label, { quiet: true })} highlight={highlight} />;
    case "add":
      return (
        <SearchRow
          id={entry.key}
          href={entry.href}
          parts={plainParts(addDealLabel(entry.address), { leading: <Plus aria-hidden="true" className={cn(chromeIconClass, "text-fg-3")} /> })}
          highlight={highlight}
        />
      );
  }
}

/** Three static rows shaped like the finished ones. No shimmer (brand section 7). */
function SkeletonRows({ rows, title }: { rows: number; title?: string }) {
  return (
    <div aria-hidden="true" className="p-1 max-md:p-2">
      {title && <div className="flex h-7 items-center px-2 text-meta font-medium text-fg-3">{title}</div>}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-15 items-center gap-3 px-2 @min-[30rem]:h-10 @min-[30rem]:pointer-coarse:h-12">
          <span className="size-8 shrink-0 rounded-sm bg-fill-1" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-3 w-2/5 rounded-sm bg-fill-1" />
            <span className="h-2.5 w-1/4 rounded-sm bg-fill-1 @min-[30rem]:hidden" />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- A row ---------------- */

/** What one row shows, at both layouts (search 2.4). */
type RowParts = {
  /** In the 32px leading slot. */
  leading?: ReactNode;
  title: ReactNode;
  /** A Canceled task: struck through, in --fg-3. */
  struck?: boolean;
  /** One line (480px and wider): after the title. */
  meta?: ReactNode;
  /** One line: the 100px status column. */
  status?: ReactNode;
  /** One line: the 80px edge column, right-aligned. */
  edge?: ReactNode;
  /** Two lines (below 480px): the second line. A row without one is a 48px single line. */
  sub?: ReactNode;
  /** Two lines: the right end of the first line, and of the second. */
  topRight?: ReactNode;
  bottomRight?: ReactNode;
  /** The accessible text, and what typeahead matches. */
  text: string;
};

const slotClass = "flex size-8 shrink-0 items-center justify-center";

/**
 * One row of the palette, a ListBoxItem: a link (`href`, so Cmd-click and
 * middle-click open a new tab and hovering shows the URL) or an action.
 * Measured on the panel with a container query: from 480px wide one line of
 * 40px (48 on touch) with a status column and an edge column; below, two
 * lines of 60px, the status word leading the second line.
 */
export function SearchRow({
  id,
  href,
  onAction,
  parts,
  highlight,
}: {
  id: string;
  href?: string;
  onAction?: () => void;
  parts: RowParts;
  /** Set on the first row of the list: the highlight goes to it whenever this value changes. */
  highlight?: string;
}) {
  const twoLines = parts.sub !== undefined;
  const titleClass = cn("truncate text-body", parts.struck ? "text-fg-3 line-through" : "text-fg-1");
  return (
    <ListBoxItem
      id={id}
      href={href}
      onAction={onAction}
      textValue={parts.text}
      className={cn(
        "flex cursor-default items-center gap-3 rounded-sm px-2 outline-none",
        twoLines ? "h-15" : "h-12",
        "@min-[30rem]:h-10 @min-[30rem]:pointer-coarse:h-12",
        "data-focused:bg-fill-2 data-pressed:bg-fill-2",
        // On touch only a keyboard highlight (an iPad's arrow keys) or a press draws, so opening the panel doesn't paint a row.
        "pointer-coarse:data-focused:not-data-focus-visible:not-data-pressed:bg-transparent",
      )}
    >
      {highlight !== undefined && <HighlightFirst itemKey={id} token={highlight} />}
      <span className={slotClass}>{parts.leading}</span>

      {/* Below 480px: two lines. */}
      <span className="flex min-w-0 flex-1 flex-col justify-center @min-[30rem]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn(titleClass, "min-w-0 flex-1")}>{parts.title}</span>
          {parts.topRight}
        </span>
        {twoLines && (
          <span className="flex min-w-0 items-center gap-2 text-meta text-fg-3">
            <span className="min-w-0 flex-1 truncate">{parts.sub}</span>
            {parts.bottomRight}
          </span>
        )}
      </span>

      {/* From 480px: one line, the status and edge columns fixed so they line up row to row. */}
      <span className="hidden min-w-0 flex-1 items-baseline gap-2 @min-[30rem]:flex">
        <span className={cn(titleClass, "min-w-0 shrink-[4]")}>{parts.title}</span>
        {parts.meta && <span className="min-w-0 truncate text-meta text-fg-3">{parts.meta}</span>}
      </span>
      <span className="hidden w-25 shrink-0 truncate text-meta @min-[30rem]:block @min-[30rem]:pointer-coarse:w-26">
        {parts.status}
      </span>
      <span className="hidden w-20 shrink-0 items-center justify-end gap-1.5 text-meta tabular-nums @min-[30rem]:flex @min-[30rem]:pointer-coarse:w-22">
        {parts.edge}
      </span>
    </ListBoxItem>
  );
}

/**
 * Inside the first row of the list: sends the highlight to it, on mount and
 * whenever `token` changes (the rows were replaced). It makes the focus calls
 * `autoFocus` makes at mount, so the list stays one ListBox and the input's
 * aria-activedescendant always names a row on screen. Renders nothing.
 */
function HighlightFirst({ itemKey, token }: { itemKey: string; token: string }) {
  const state = useContext(ListStateContext);
  const focus = useEffectEvent(() => {
    state?.selectionManager.setFocused(true);
    state?.selectionManager.setFocusedKey(itemKey);
  });
  useEffect(() => {
    focus();
  }, [itemKey, token]);
  return null;
}

/** The title with the typed words at weight 600 (search choice 4 B). Title only, never the meta. */
function Marked({ text, q }: { text: string; q: string }) {
  const ranges = q ? matchRanges(text, q) : [];
  if (ranges.length === 0) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) out.push(text.slice(at, start));
    out.push(
      <span key={i} className="font-semibold">
        {text.slice(start, end)}
      </span>,
    );
    at = end;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

const units = (n: number) => `${n} ${n === 1 ? "unit" : "units"}`;

/** A deal stage's word, in its tone: --fg-2, and Closed in --ok. */
const stageTone = (stage: string) => (stage === "CLOSED!" ? "text-ok" : "text-fg-2");

function rowParts(row: SearchRowData, q: string, today: Ymd): RowParts {
  switch (row.type) {
    case "property": {
      const owner = row.units !== null ? (row.owner ? ` · ${row.owner}` : "") : (row.owner ?? "");
      return {
        // The photo is decorative here: the title names the place. No photo yet is the House tile.
        leading: (
          <span aria-hidden="true">
            <PhotoThumb size={32} src={row.photoUrl} alt="" />
          </span>
        ),
        title: <Marked text={row.title} q={q} />,
        meta: `${row.units !== null ? units(row.units) : ""}${owner}` || undefined,
        sub: row.units !== null ? units(row.units) : "Property",
        text: [row.title, row.owner].filter(Boolean).join(", "),
      };
    }
    case "task": {
      const day = row.due ? dayLabel(row.due, today) : null;
      const dayTone = row.overdue ? "text-danger" : "text-fg-2";
      const when = day ? <span className={cn("shrink-0", dayTone)}>{day}</span> : null;
      const who = row.assignee ? <Avatar name={row.assignee.name} size={20} outline={row.assignee.contractor} /> : null;
      return {
        leading: <StatusMark status={row.status} />,
        title: <Marked text={row.title} q={q} />,
        struck: row.status === "CANCELED",
        meta: row.place ?? undefined,
        status: <span className={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</span>,
        // The avatar has a slot of its own and the date is right-aligned after it, so each holds one x down the list.
        edge: (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center">{who}</span>
            <span className={cn("min-w-0 flex-1 whitespace-nowrap text-right", dayTone)}>{day}</span>
          </>
        ),
        sub: (
          <>
            <span className={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</span>
            {row.place && ` · ${row.place}`}
          </>
        ),
        topRight: when ?? undefined,
        bottomRight: who ?? undefined,
        text: [row.title, STATUS_LABEL[row.status], row.place].filter(Boolean).join(", "),
      };
    }
    case "deal": {
      const price = row.asking !== null ? <Money value={row.asking} className="text-meta text-fg-2" /> : null;
      const stage = dealStageLabel(row.stage);
      return {
        leading: <DealStageMark stage={row.stage} />,
        title: <Marked text={row.title} q={q} />,
        status: <span className={stageTone(row.stage)}>{stage}</span>,
        edge: price,
        sub: <span className={stageTone(row.stage)}>{stage}</span>,
        topRight: price ? <span className="shrink-0 tabular-nums">{price}</span> : undefined,
        text: [row.title, stage].join(", "),
      };
    }
    case "contractor": {
      const meta = [row.trade, row.company].filter(Boolean).join(" · ");
      const inactive = !row.active ? <span className={tagClass}>Inactive</span> : null;
      return {
        leading: <Avatar name={row.title} size={24} outline />,
        title: <Marked text={row.title} q={q} />,
        meta: meta || undefined,
        status: inactive,
        sub: row.trade ?? row.company ?? "Contractor",
        topRight: inactive ?? undefined,
        text: [row.title, meta, row.active ? "" : "Inactive"].filter(Boolean).join(", "),
      };
    }
  }
}

const COMMAND_ICON: Record<CommandIcon, LucideIcon> = {
  home: House,
  deals: TrendingUp,
  portfolio: Building2,
  financials: ChartColumn,
  tasks: SquareCheckBig,
  contractors: Wrench,
  playbooks: ClipboardList,
  settings: Settings2,
  create: Plus,
};

function commandParts(c: Command): RowParts {
  const Icon = COMMAND_ICON[c.icon];
  const beside = c.parent ?? c.place;
  return {
    leading: <Icon aria-hidden="true" className={cn(chromeIconClass, "text-fg-3")} />,
    title: c.label,
    meta: beside,
    sub: beside,
    text: [c.label, beside].filter(Boolean).join(", "),
  };
}

/** A row that is only words: "See all 40 tasks", "Open in Tasks", the Add row. */
function plainParts(label: string, options: { leading?: ReactNode; quiet?: boolean } = {}): RowParts {
  return {
    leading: options.leading,
    title: options.quiet ? <span className="text-fg-2">{label}</span> : label,
    text: label,
  };
}
