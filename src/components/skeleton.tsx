import { Fragment, type ReactNode } from "react";
import { StatusMark } from "@/components/status-badge";
import { LOADING_SCREEN_ATTR } from "@/lib/loading-screen";
import { cn } from "@/lib/utils";

/*
 * Loading screens (docs/specs/performance.md 4.2; brand section 7: "Skeletons
 * match the finished layout, draw labels at once and hold values in static
 * --fill-1. No shimmer."). A page's loading.tsx draws its own containers,
 * grid and responsive classes, its titles, tabs, back links and column
 * headers, and puts these blocks where the data goes, so nothing moves when
 * the content lands. The screen's root carries aria-busy="true"; every block
 * is aria-hidden. No motion: the screen shows in the click's frame and the
 * content replaces it without a fade.
 */

/**
 * A loading.tsx's root: `aria-busy`, and the mark the app shell waits on, so
 * focus moves to the page's h1 once the page lands and not to the screen's
 * (lib/loading-screen.ts). `className` is the page's own outer box.
 */
export function LoadingScreen({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" {...{ [LOADING_SCREEN_ATTR]: "" }} className={className}>
      {children}
    </div>
  );
}

/**
 * A static --fill-1 block standing in for a value. With `text` (a type token,
 * "text-body") it takes one line of that token's height, at a mouse and on
 * touch, and draws the bar at the text's size inside it: a name, a date, a
 * figure. Without it `className` sets the size: a photo, an avatar, a chip's
 * frame. Square corners on text; a photo or avatar passes its own radius.
 * `inline` sits it in a line of text, as a figure in a FactStrip.
 */
export function Block({ text, inline = false, className }: { text?: string; inline?: boolean; className?: string }) {
  if (text) {
    return (
      <span aria-hidden="true" className={cn("flex min-w-0 items-center", text)}>
        {/* A zero-width space holds the token's line height. */}
        {"​"}
        <span className={cn("block h-[1em] max-w-full bg-fill-1", className)} />
      </span>
    );
  }
  return <span aria-hidden="true" className={cn(inline ? "inline-block align-middle" : "block", "bg-fill-1", className)} />;
}

/**
 * A value that wraps as text does (a name, a company, a list of trades), as
 * its words: inline --fill-1 blocks with spaces between, so a table column
 * that's too narrow wraps them where it would wrap the words, and sizes
 * itself as it will for the text that lands. One line of `text`'s height each.
 */
export function Words({ text, widths }: { text: string; widths: readonly string[] }) {
  return (
    <span aria-hidden="true" className={cn("block", text)}>
      {widths.map((w, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className={cn("inline-block h-[1em] bg-fill-1 align-middle", w)} />
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A record's h1 while it loads (an address, a name, a task's title): the title
 * line inside the editable heading's 4px padding (InlineField's heading), so
 * the real one lands on the same line. `phoneLines` 2 adds a second, shorter
 * line below sm, where an address or a title wraps.
 */
export function HeadingBlock({ className, phoneLines = 1 }: { className?: string; phoneLines?: 1 | 2 }) {
  return (
    <div className="py-1">
      <Block text="text-title" className={className} />
      {phoneLines === 2 && (
        <div className="sm:hidden">
          <Block text="text-title" className="w-2/5" />
        </div>
      )}
    </div>
  );
}

/** Widths that vary row to row, so a column of blocks reads as rows of text and not a bar chart. */
const TITLE_WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3", "w-[55%]"];
const PLACE_WIDTHS = ["w-28", "w-24", "w-32", "w-20"];

/** The width for row `i` from a list, so a skeleton's rows differ without random numbers. */
export function rowWidth(i: number, widths: readonly string[] = TITLE_WIDTHS): string {
  return widths[i % widths.length];
}

/**
 * The command palette's rows while a first load runs: an icon tile, a title
 * and, below 30rem, a subline, at the finished rows' heights.
 */
export function SkeletonRows({ rows, title }: { rows: number; title?: string }) {
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

/**
 * A task row while its list loads, on TaskRow's own boxes (tasks/task-row.tsx):
 * the check ring drawn, then blocks for the title, the place, the avatar and
 * the date chip's frame. Two lines in a list under 50rem or below lg, one line
 * with fixed columns on a wide list, as TaskRow lays them. Sits in TaskRow's
 * `@container divide-y` list. `i` varies the widths.
 */
export function TaskRowSkeleton({
  i = 0,
  checkbox = true,
  avatar = true,
  oneLine = true,
}: {
  i?: number;
  checkbox?: boolean;
  avatar?: boolean;
  /** False where the real rows always take two lines (Today's columns, a row with actions). */
  oneLine?: boolean;
}) {
  const wide = (cls: string) => (oneLine ? cls : undefined);
  return (
    <li aria-hidden="true" className={cn("relative flex items-start gap-3 py-1.5 pointer-coarse:min-h-12", wide("lg:@min-[50rem]:items-center"))}>
      {checkbox && (
        // TaskCheckbox's 44px box and its offsets, the To do ring in it.
        <span className={cn("-m-3 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center", wide("lg:@min-[50rem]:-mt-3"))}>
          <StatusMark status="OPEN" className="size-4.5 pointer-coarse:size-4.5" />
        </span>
      )}
      <span className={cn("relative block min-w-0 flex-1", wide("lg:@min-[50rem]:flex lg:@min-[50rem]:items-center lg:@min-[50rem]:gap-3"))}>
        <span className={cn("flex min-w-0 items-center gap-3", wide("lg:@min-[50rem]:contents"))}>
          <span className="min-w-0 flex-1">
            <Block text="text-body" className={rowWidth(i)} />
          </span>
          {/* The date chip's 28px frame, last on a one-line row. */}
          <span className={cn("flex shrink-0", wide("lg:@min-[50rem]:order-last lg:@min-[50rem]:w-30 lg:@min-[50rem]:justify-end"))}>
            <Block className="h-7 w-20 rounded-md" />
          </span>
        </span>
        <span className={cn("mt-0.5 flex min-h-5 min-w-0 items-center gap-2", wide("lg:@min-[50rem]:contents"))}>
          <span className={cn("min-w-0 grow", wide("lg:@min-[50rem]:block lg:@min-[50rem]:w-36 lg:@min-[50rem]:flex-none"))}>
            <Block text="text-meta" className={rowWidth(i, PLACE_WIDTHS)} />
          </span>
          {avatar && (
            <span className="ml-auto flex w-5 shrink-0 items-center">
              <Block className="size-5 rounded-full" />
            </span>
          )}
        </span>
      </span>
    </li>
  );
}
