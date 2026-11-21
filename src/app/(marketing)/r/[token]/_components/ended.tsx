import { publicType } from "@/components/public/ui";
import { cn } from "@/lib/utils";
import { residentColumn } from "./column";

/** A link that was turned off, replaced, or outlived the lease (section 2, defaults). */
export function Ended() {
  return (
    <main className={cn(residentColumn, "py-10")}>
      <h1 className={cn(publicType.heading, "text-foreground")}>This ticket has been closed</h1>
      <p className={cn(publicType.meta, "mt-2 text-muted-foreground")}>Questions? Text us in our group chat.</p>
    </main>
  );
}
