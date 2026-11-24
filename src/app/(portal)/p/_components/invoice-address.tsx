"use client";
import { Copy } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";

/** Writes the address to the clipboard and says so; says what to do when the browser refuses. */
function useCopyAddress(address: string) {
  const { toast } = useToast();
  return async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ message: "Address copied" });
    } catch {
      toast({ message: "Couldn't copy. Select it." });
    }
  };
}

/**
 * The invoice address under Your invoices' title (docs/contractor-invoices-plan.md, 6 item 6; drawing 15, B): one
 * quiet line with Copy, "Or email them to invoices@…" on a laptop and tablet and the address alone on a phone, one
 * line down to 320. Most jobs sit on a partner, so a contractor often has no Send invoice button, and the address is
 * their way in; this is where they find it again.
 */
export function InvoiceAddressLine({ address }: { address: string }) {
  const copy = useCopyAddress(address);
  return (
    <div className="mt-1 flex items-center">
      <p className="min-w-0 truncate text-meta text-muted-foreground">
        <span className="max-sm:hidden">Or email them to </span>
        {address}
      </p>
      <Button type="button" variant="ghost" size="sm" aria-label={`Copy ${address}`} className="-mr-2.5 shrink-0" onClick={copy}>
        Copy
      </Button>
    </div>
  );
}

/** The empty state's own copy of the address: "You can also email them to", the address, and Copy address. */
export function InvoiceAddressCard({ address }: { address: string }) {
  const copy = useCopyAddress(address);
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-body text-muted-foreground">
        You can also email them to
        <span className="mt-0.5 block break-all text-foreground">{address}</span>
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={copy}>
        <Copy className="size-4" aria-hidden="true" />
        Copy address
      </Button>
    </div>
  );
}
