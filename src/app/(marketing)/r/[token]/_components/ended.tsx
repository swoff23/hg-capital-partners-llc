import { publicType } from "@/components/public/ui";
import { endedWords, type LinkEnded } from "@/lib/residents/steps";
import { cn } from "@/lib/utils";
import { residentColumn } from "./column";

/**
 * A link that was turned off, replaced, or outlived the lease (section 2, defaults): "This link was replaced." when a
 * newer one was emailed, else "This link no longer works." (docs/specs/tenant-welcome-email.md, Q1).
 */
export function Ended({ why }: { why: LinkEnded }) {
  const { heading, lines } = endedWords(why);
  return (
    <main className={cn(residentColumn, "py-10")}>
      <h1 className={cn(publicType.heading, "text-foreground")}>{heading}</h1>
      {lines.map((line, i) => (
        <p key={line} className={cn(publicType.meta, i === 0 && "mt-2", "text-muted-foreground")}>
          {line}
        </p>
      ))}
    </main>
  );
}
