"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormSheet } from "@/components/form-sheet";
import { MediaUploadTray, UploadTile, useMediaUploader, type RecordMediaInput } from "@/components/media-uploader";
import { publicSecondaryClass } from "@/components/public/ui";
import { useToast } from "@/components/toast";
import { Button, FormField, Textarea } from "@/components/ui";
import type { UploadTarget } from "@/components/upload-queue";
import { callAction } from "@/lib/action-result";
import { uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { cn } from "@/lib/utils";
import { addMore, cancelRequest, recordUpload } from "../actions";

type Ready = { id: string; filename: string; video: boolean; hasThumb: boolean };

/**
 * Add photos or a note (docs/specs/maintenance-requests.md, section 3.5;
 * drawing 09 B): the form's note box and photo picker in a sheet, a bottom
 * sheet on a phone and a dialog from md. It posts to the task, and the page
 * shows it under Additional comments.
 */
export function AddMore({ token, linkId, requestId }: { token: string; linkId: string; requestId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [ready, setReady] = useState<Ready[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = useCallback(
    async (file: RecordMediaInput) => {
      const res = await recordUpload(token, file);
      if (res.ok) {
        const id = res.data.id;
        const video = !!file.posterPathname || /\.(mov|mp4)$/i.test(file.filename);
        setReady((r) => (r.some((x) => x.id === id) ? r : [...r, { id, filename: file.filename, video, hasThumb: !!(file.thumbPathname || file.posterPathname) }]));
      }
      return res;
    },
    [token],
  );
  const target = useMemo<UploadTarget>(
    () => ({
      // One queue per request's Add, apart from the new-request form's.
      key: `${uploadTargetKey("resident-upload", linkId)}:${requestId}`,
      label: "Your request",
      uploadKind: "resident-upload",
      parentId: linkId,
      access: "private",
      allowed: ["image", "video"],
      prepare: "display",
      maxFiles: 10,
      record,
      whenAway: "hold",
    }),
    [linkId, record, requestId],
  );
  const uploader = useMediaUploader({ target });

  async function submit() {
    if (pending) return;
    if (uploader.pending > 0) return setError("Wait for the photos to finish, then Add.");
    if (!note.trim() && ready.length === 0) return setError("Write something or add a photo.");
    setError(null);
    setPending(true);
    const res = await callAction(() => addMore(token, requestId, { note, uploadIds: ready.map((r) => r.id) }));
    setPending(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    setNote("");
    setReady([]);
    toast({ message: "Added to your request" });
    router.refresh();
  }

  const r = encodeURIComponent(token);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(publicSecondaryClass, "mt-5 w-full")}>
        Add photos or a note
      </button>
      <FormSheet
        title="Add to your request"
        isOpen={open}
        onOpenChange={setOpen}
        onSubmit={submit}
        primary="Add"
        pending={pending}
        values={{ note, files: ready.map((x) => x.id).join(",") }}
        discardTitle="Discard what you added?"
        error={error}
        surface="public"
      >
        <FormField label="Note" optional>
          {(p) => <Textarea {...p} name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </FormField>
        <div>
          <p className="text-label text-foreground">Photos or video</p>
          {uploader.inputs}
          <MediaUploadTray
            uploader={uploader}
            layout="grid"
            slots={1}
            filled={ready.length}
            onSlot={uploader.chooseFiles}
            label="Photos or video"
            className="mt-2"
            leading={ready.map((x) => (
              <UploadTile
                key={x.id}
                grid
                ready
                upload={{
                  key: x.id,
                  name: x.filename,
                  kind: x.video ? "video" : "image",
                  previewUrl: x.hasThumb ? `/api/files/resident-upload/${x.id}?v=${x.video ? "poster" : "thumb"}&r=${r}` : null,
                  progress: 1,
                  status: "saving",
                }}
                onRemove={() => setReady((all) => all.filter((y) => y.id !== x.id))}
              />
            ))}
          />
        </div>
      </FormSheet>
    </>
  );
}

/** Cancel this request (section 3.6; drawing 08 A): a text link, then one confirm. Only while it shows Received. */
export function CancelRequest({ token, requestId }: { token: string; requestId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    const res = await callAction(() => cancelRequest(token, requestId));
    setBusy(false);
    setAsking(false);
    if (!res.ok) return toast({ message: res.error });
    toast({ message: "Request canceled" });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-6 inline-flex min-h-11 items-center text-meta text-muted-foreground underline underline-offset-4 pointer-fine:hover:text-foreground"
      >
        Cancel this request
      </button>
      {asking && (
        <ConfirmDialog
          title="Cancel this request?"
          onClose={() => setAsking(false)}
          cancelLabel="Keep it"
          busy={busy}
          actions={
            <Button variant="destructive" size="sm" disabled={busy} onClick={cancel}>
              {busy ? "Canceling…" : "Cancel request"}
            </Button>
          }
        />
      )}
    </>
  );
}
