"use client";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control";

/** Required | Suggested (docs/specs/missing-info.md, section 5), kept in `?show`, so a reload and Back keep the pick. */
export function ShowSwitch({ show, required, suggested }: { show: "required" | "suggested"; required: number; suggested: number }) {
  const router = useRouter();
  return (
    <SegmentedControl
      aria-label="Show"
      size="md"
      value={show}
      onChange={(key) => router.replace(key === "suggested" ? "/missing?show=suggested" : "/missing", { scroll: false })}
      options={[
        { key: "required", label: "Required", count: required },
        { key: "suggested", label: "Suggested", count: suggested },
      ]}
    />
  );
}
