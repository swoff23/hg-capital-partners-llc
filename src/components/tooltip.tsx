"use client";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small hover label. Renders itself `position: fixed` so it escapes any
 * `overflow` clipping from scroll containers (tables, cards). The ink label
 * on the toast tokens, at the Float level.
 */
export function Tooltip({
  label,
  children,
  className,
  delay = 250,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setAt({ x: r.left + r.width / 2, y: r.top });
    }, delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setAt(null);
  };

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={hide}
      className={cn("inline-flex", className)}
    >
      {children}
      {at && label && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-toast-edge bg-toast-bg px-2 py-1 text-micro text-toast-fg shadow-float"
          style={{ left: at.x, top: at.y - 8 }}
        >
          {label}
          <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-toast-bg" />
        </span>
      )}
    </span>
  );
}
