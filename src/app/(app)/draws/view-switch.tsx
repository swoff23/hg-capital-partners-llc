"use client";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control";

/** Open | Done on Draws, kept in the URL (`?view=done`) so Back and a pasted link land on the same list. */
export function ViewSwitch({ view, open, done }: { view: "open" | "done"; open: number; done: number }) {
  const router = useRouter();
  return (
    <SegmentedControl
      aria-label="Rehabs"
      size="md"
      value={view}
      onChange={(next) => router.replace(next === "done" ? "/draws?view=done" : "/draws", { scroll: false })}
      options={[
        { key: "open", label: "Open", count: open },
        { key: "done", label: "Done", count: done },
      ]}
    />
  );
}
