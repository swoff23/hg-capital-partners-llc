"use client";
import type { ReactNode } from "react";
import { useToast } from "@/components/toast";
import { UploadQueueProvider } from "@/components/upload-queue";
import { postEveryKept } from "../jobs/[id]/_components/record-and-post";

/**
 * The portal's upload queue (UploadQueueProvider), one per contractor
 * (`scope`, "portal:<contact id>"), with the files the tab kept for that
 * person's jobs posted again when the queue wakes: the signal comes back, or
 * the tab does with one. A post that failed offline left them kept
 * (recorded-uploads.ts keep), and without this they would wait for that job's
 * page to open again, whichever page is open now.
 */
export function PortalUploadQueue({ scope, children }: { scope: string; children: ReactNode }) {
  const { toast } = useToast();
  return (
    <UploadQueueProvider scope={scope} onWake={() => void postEveryKept(toast, scope)}>
      {children}
    </UploadQueueProvider>
  );
}
