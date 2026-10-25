import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A form field with its label above it: text-meta 500 in --fg-2, sentence
 * case, 6px over the field (docs/brand-guidelines.md, section 9 Inputs).
 * The property forms (new property and the record's section editors).
 */
export function LabeledField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="text-meta font-medium text-fg-2">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
