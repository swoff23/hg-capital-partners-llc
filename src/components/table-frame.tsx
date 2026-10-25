"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Table's box (components/ui.tsx). A table wider than its column scrolls
 * sideways here, so it never widens the page. A box that scrolls is its own
 * scroll container, and a sticky header can't stick to the page from inside
 * one, so the box measures its table: while the table fits, the box stops
 * scrolling (`data-fits`) and `Th` holds under the app bar as the page
 * scrolls. Until it has measured, it scrolls, and the header simply scrolls
 * with the page.
 */
export function TableFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const frame = ref.current;
    const table = frame?.firstElementChild;
    if (!frame || !(table instanceof HTMLElement)) return;
    const measure = () => setFits(table.offsetWidth <= frame.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-fits={fits || undefined}
      className="w-full max-w-full overflow-x-auto data-fits:overflow-x-visible data-fits:[--th-top:var(--app-bar-h)]"
    >
      {children}
    </div>
  );
}
