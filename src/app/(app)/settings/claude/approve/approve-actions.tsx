"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { allowClaude, cancelClaude } from "../actions";

/**
 * Cancel and Allow, sharing the card's width. Each is a server action; both buttons wait while either runs. `rid`
 * is the request this card was drawn for: both actions act on it and on no other.
 */
export function ApproveActions({ rid }: { rid: string }) {
  return (
    <form className="grid grid-cols-2 gap-2">
      <input type="hidden" name="rid" value={rid} />
      <Buttons />
    </form>
  );
}

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" variant="secondary" className="w-full" formAction={cancelClaude} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" className="w-full" formAction={allowClaude} disabled={pending}>
        Allow
      </Button>
    </>
  );
}
