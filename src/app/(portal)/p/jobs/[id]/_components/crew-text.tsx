"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, MessageSquareText, Share } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Spinner, useSpinnerVisible } from "@/components/spinner";
import { useToast } from "@/components/toast";
import { Button, buttonClass } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { callAction } from "@/lib/action-result";
import { smsHref } from "@/lib/portal/login-text";
import { cn } from "@/lib/utils";
import { crewTextAction } from "../actions";

/**
 * "Text to my crew" (docs/specs/contractor-job-emails.md, section 4): the
 * header's message button, and the sheet it opens with the text ready to
 * send from their own phone. The sheet follows the login-details payoff on
 * the contractor page (Text login details), with Grab's share sheet as the
 * reference for the preview over its buttons: on a phone Send text opens
 * Messages filled in, with Share (the phone's own sheet: WhatsApp and the
 * rest) and Copy beside it; with a mouse Copy leads. The text is made when
 * the sheet opens (jobs.ts crewTextFor), each time with a link of its own.
 *
 * `openOnLoad` is an email's Text to my crew button (`?do=share`): the sheet
 * opens once as the page loads, and the ?do= comes off the address.
 */
export function CrewText({ taskId, openOnLoad = false }: { taskId: string; openOnLoad?: boolean }) {
  const { toast } = useToast();
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const spinning = useSpinnerVisible(loading);
  // Read as the sheet draws, which is only ever in the browser (it opens on a tap or after the page loads).
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function show() {
    setOpen(true);
    if (text) return;
    startLoading(async () => {
      const res = await callAction(() => crewTextAction(taskId));
      if (res.ok) {
        setText(res.data);
      } else {
        setOpen(false);
        toast({ message: res.error });
      }
    });
  }

  const askedOnLoad = useRef(false);
  useEffect(() => {
    if (!openOnLoad || askedOnLoad.current) return;
    askedOnLoad.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("do");
    window.history.replaceState(null, "", url);
    show();
    // Once per page load; show reads the latest state when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnLoad]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: "Text copied" });
    } catch {
      toast({ message: "Couldn't copy. Select the text to copy it instead." });
    }
  }

  function share() {
    if (text) void navigator.share({ text }).catch(() => {});
  }

  return (
    <>
      <Button variant="ghost" icon aria-label="Text to my crew" className="h-11 w-11" onClick={show}>
        <MessageSquareText className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Sheet
        title="Text to my crew"
        isOpen={open}
        onOpenChange={setOpen}
        footer={
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            {coarse && canShare && (
              <Button variant="secondary" disabled={!text} onClick={share}>
                <Share className="h-4 w-4" aria-hidden="true" />
                Share
              </Button>
            )}
            {coarse ? (
              <>
                <Button variant="secondary" disabled={!text} onClick={copy}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy
                </Button>
                <a
                  href={text ? smsHref(null, text) : undefined}
                  aria-disabled={!text}
                  className={cn(buttonClass({ variant: "primary" }), "w-full md:w-auto", !text && "pointer-events-none opacity-50")}
                >
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  Send text
                </a>
              </>
            ) : (
              <Button disabled={!text} onClick={copy}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy
              </Button>
            )}
          </div>
        }
      >
        <div className="p-4">
          {text ? (
            <p className="rounded-md border border-line bg-surface p-3 text-body whitespace-pre-wrap text-fg-1 wrap-anywhere">{text}</p>
          ) : (
            <div className="flex h-24 items-center justify-center">{spinning && <Spinner className="size-5" />}</div>
          )}
        </div>
      </Sheet>
    </>
  );
}
