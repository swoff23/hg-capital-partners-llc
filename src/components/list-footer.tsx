import { ScopeButton } from "@/components/filter-bar";
import { listFooter } from "@/lib/list-page";

/**
 * The foot of a long list: how many rows are showing out of how many, with Show more, which asks the URL for
 * another page (`?show=200`). It draws nothing once every row is on the page. Inside a `FilterScope`, under the
 * rows:
 *
 *   <ListFooter shown={take} total={total} ceiling={TASK_PAGE_MAX} />   // Tasks: stops at 400
 *   <ListFooter shown={take} total={total} />                           // no ceiling: Show more until all are on
 *
 * `shown` is the page's row limit (`listLimit` in lib/list-page.ts, which also holds the page size and the
 * words). At a ceiling the line reads "First 400 of 2,036. Search or filter for more." with no button. The line
 * is one line at every width: it truncates before it would wrap, and the button keeps its size.
 */
export function ListFooter({
  shown,
  total,
  ceiling = null,
}: {
  /** How many rows the page asked for. */
  shown: number;
  /** How many rows the view holds. */
  total: number;
  /** The most the list ever shows, or null (the default) for none. */
  ceiling?: number | null;
}) {
  const foot = listFooter(shown, total, { ceiling });
  if (!foot) return null;
  return (
    <div className="mt-4 flex items-center gap-3">
      <p className="min-w-0 truncate text-meta tabular-nums text-muted-foreground">{foot.line}</p>
      {foot.more !== null && <ScopeButton changes={{ show: String(foot.more) }}>Show more</ScopeButton>}
    </div>
  );
}
