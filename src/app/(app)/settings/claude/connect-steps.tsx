"use client";
import { Button, Input } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { CLAUDE_LINES, CONNECT_STEPS } from "./claude-state";

/**
 * The Connect steps (docs/specs/tasks-from-claude.md 7.1): a centered dialog at 28rem from md, a bottom sheet on a
 * phone. The address is this partner's own, built from the app's own URL, since Claude refuses one that doesn't
 * match; opening the steps again shows the same one.
 */
export function ConnectSteps({
  isOpen,
  onOpenChange,
  address,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
}) {
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      toast({ message: CLAUDE_LINES.addressCopied });
    } catch {
      toast({ message: CLAUDE_LINES.copyFailed });
    }
  }

  const [copyStep, ...rest] = CONNECT_STEPS;
  return (
    <Sheet
      title="Connect Claude"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      className="md:w-full md:max-w-md"
      footer={
        <div className="flex md:justify-end">
          <Button type="button" variant="secondary" className="max-md:w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-4 text-body text-foreground">
        <ol className="list-decimal space-y-4 pl-5 marker:text-fg-2">
          <li className="space-y-2 pl-1">
            <p>{copyStep}</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={address}
                aria-label="Connector address"
                className="min-w-0 flex-1"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="secondary" onClick={copy}>
                Copy
              </Button>
            </div>
          </li>
          {rest.map((step) => (
            <li key={step} className="pl-1">
              {step}
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
