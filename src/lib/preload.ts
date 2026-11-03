/**
 * Starts a cached read (React `cache()`) that a section further down the page
 * awaits, so it runs beside the page's first reads instead of after the page
 * has rendered. The section's own call gets the same promise. The catch only
 * marks this early start as handled; whoever awaits the read still gets its error.
 */
export function preload(read: Promise<unknown>): void {
  read.catch(() => {});
}
