"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Room kept between the label and the viewport's edges, in px. */
const EDGE = 8;

/**
 * A small label over its trigger. With a mouse it opens on hover, after
 * `delay`, and a click closes it. Touch has no hover, so there a tap opens
 * it and a second tap, a tap anywhere else, a scroll or Esc closes it.
 * It renders `position: fixed`, so it escapes any `overflow` clipping from
 * scroll containers (tables, cards), and it stays inside the viewport; a long
 * label wraps, and a "\n" in it starts a new line. The ink label on the toast
 * tokens, at the Float level.
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
  const tipRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointer = useRef<string>("mouse");
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [tapped, setTapped] = useState(false);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => {
    clearTimeout(timer.current);
    setAt(null);
    setTapped(false);
  };

  // Keep the label inside the viewport; the arrow still points at the trigger.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!at || !el) return;
    const half = el.offsetWidth / 2;
    const x = Math.min(Math.max(at.x, EDGE + half), window.innerWidth - EDGE - half);
    el.style.left = `${x}px`;
    if (arrowRef.current) arrowRef.current.style.left = `calc(50% + ${at.x - x}px)`;
  }, [at]);

  // Opened by a tap: the next tap elsewhere, a scroll or Esc closes it.
  useEffect(() => {
    if (!tapped) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) hide();
    };
    // One Esc closes one layer: a toast (or any layer on top) that took the key has already called preventDefault.
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) hide();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
    };
  }, [tapped]);

  return (
    <span
      ref={ref}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(timer.current);
        timer.current = setTimeout(place, delay);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") hide();
      }}
      onClick={() => {
        if (pointer.current === "mouse") return hide();
        if (tapped) return hide();
        place();
        setTapped(true);
      }}
      className={cn("inline-flex", className)}
    >
      {children}
      {at && label && (
        <span
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none fixed z-[60] w-max max-w-[min(20rem,calc(100vw-1rem))] -translate-x-1/2 -translate-y-full whitespace-pre-line text-pretty rounded-md border border-toast-edge bg-toast-bg px-2 py-1 text-micro text-toast-fg shadow-float"
          style={{ left: at.x, top: at.y - 8 }}
        >
          {label}
          <span
            ref={arrowRef}
            className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-toast-bg"
          />
        </span>
      )}
    </span>
  );
}
