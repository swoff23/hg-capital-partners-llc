"use client";
import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { publicCtaClass, publicType } from "@/components/public/ui";
import { MediaUploadTray, UploadTile, useMediaUploader, type MediaUpload, type RecordMediaInput } from "@/components/media-uploader";
import { SpotArt } from "@/components/spot-art";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormField, Input, SaveError, Textarea } from "@/components/ui";
import type { UploadTarget } from "@/components/upload-queue";
import { useLeaveWarning } from "@/components/use-leave-warning";
import { callAction } from "@/lib/action-result";
import { uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { cn } from "@/lib/utils";
import { recordUpload, sendRequest } from "../actions";
import { residentColumn } from "../_components/column";

const MAX_FILES = 10;
/** Short, since it leads every email subject (lib/residents/requests.ts WHATS_WRONG_MAX); the rest goes in Tell us more. */
const WHATS_WRONG_MAX = 50;
/** The count shows once they're close, so the stop at 50 never comes as a surprise. */
const COUNT_FROM = 35;

/** A file that's up and checked, waiting for Send: drawn as the composer draws a ready file. */
type Ready = { id: string; filename: string; video: boolean; hasThumb: boolean };

function asReady(r: Ready, token: string): MediaUpload {
  return {
    key: r.id,
    name: r.filename,
    kind: r.video ? "video" : "image",
    previewUrl: r.hasThumb ? `/api/files/resident-upload/${r.id}?v=${r.video ? "poster" : "thumb"}&r=${encodeURIComponent(token)}` : null,
    progress: 1,
    status: "saving",
  };
}

/**
 * Report a problem (docs/specs/maintenance-requests.md, section 3.2; drawings
 * 03 A, 04 A, 05 A): one screen. What's wrong, more if they want, photos or
 * video, then "Can we fix it if you're not home?" with each choice saying what it
 * means, and pets after a Yes. Photos go up while they type, through their
 * link's own upload queue, and wait as ready tiles until Send. Send waits for
 * What's wrong and the let-us-in choice (and pets after a Yes). After Send the
 * page turns into the sent screen (section 3.3).
 */
export function RequestForm({
  token,
  linkId,
  firstName,
  home,
  lastPets,
}: {
  token: string;
  linkId: string;
  firstName: string;
  home: string;
  /** Their last pets answer, filled in again (section 2, defaults). */
  lastPets: { pets: boolean; petsNote: string | null } | null;
}) {
  const [whatsWrong, setWhatsWrong] = useState("");
  const [details, setDetails] = useState("");
  const [letUsIn, setLetUsIn] = useState<boolean | null>(null);
  const [pets, setPets] = useState<boolean | null>(lastPets?.pets ?? null);
  const [petsNote, setPetsNote] = useState(lastPets?.petsNote ?? "");
  const [ready, setReady] = useState<Ready[]>([]);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; firstPhotoId: string | null } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The record step keeps what it recorded: the queue reports only ids, and a ready tile wants its name and picture.
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
      // Its own queue key: files still going up here never land in a request's Add tray, or the other way round.
      key: `${uploadTargetKey("resident-upload", linkId)}:new`,
      label: "Your request",
      uploadKind: "resident-upload",
      parentId: linkId,
      access: "private",
      allowed: ["image", "video"],
      prepare: "display",
      maxFiles: MAX_FILES,
      record,
      whenAway: "hold",
    }),
    [linkId, record],
  );
  const uploader = useMediaUploader({ target });

  const problems = {
    whatsWrong: whatsWrong.trim().length < 2 ? "Say what's wrong." : whatsWrong.trim().length > WHATS_WRONG_MAX ? `Keep it to ${WHATS_WRONG_MAX} characters. Put the rest in Tell us more.` : null,
    letUsIn: letUsIn === null ? "Pick one." : null,
    pets: letUsIn && pets === null ? "Pick one." : null,
  };
  const dirty = !sent && (whatsWrong !== "" || details !== "" || ready.length > 0 || uploader.pending > 0);
  useLeaveWarning(dirty);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setTried(true);
    if (problems.whatsWrong || problems.letUsIn || problems.pets) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true], [data-invalid] input")?.focus());
      return;
    }
    if (uploader.pending > 0) {
      setRefusal("Wait for the photos to finish, then Send.");
      return;
    }
    if (ready.length > MAX_FILES) {
      setRefusal(`Remove some: up to ${MAX_FILES} photos or videos at a time.`);
      return;
    }
    setRefusal(null);
    setPending(true);
    const res = await callAction(() =>
      sendRequest(token, {
        whatsWrong,
        details,
        letUsIn: letUsIn!,
        pets: letUsIn ? pets : null,
        petsNote: letUsIn && pets ? petsNote : null,
        uploadIds: ready.map((r) => r.id),
      }),
    );
    setPending(false);
    if (res.ok) {
      setSent(res.data);
      window.scrollTo({ top: 0 });
    } else {
      setRefusal(res.error);
    }
  }

  if (sent) return <Sent token={token} firstName={firstName} whatsWrong={whatsWrong.trim()} sent={sent} />;

  return (
    <main className={cn(residentColumn, "py-8 sm:py-10")}>
      <Link href={`/r/${token}`} className="text-meta text-muted-foreground pointer-fine:hover:text-foreground">
        ‹ My requests
      </Link>
      <h1 className={cn(publicType.heading, "mt-3 text-foreground")}>Report a problem</h1>
      <p className={cn(publicType.meta, "mt-1 text-muted-foreground")}>{home}</p>
      <p className="mt-3 text-body text-foreground">Emergency? Text us in our group chat.</p>

      <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-6">
        <FormField
          label="What's wrong?"
          helper={whatsWrong.length >= COUNT_FROM ? `${whatsWrong.length} of ${WHATS_WRONG_MAX}` : undefined}
          error={tried ? (problems.whatsWrong ?? undefined) : undefined}
        >
          {(p) => (
            <Input
              {...p}
              name="whatsWrong"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="Kitchen sink leaks"
              maxLength={WHATS_WRONG_MAX}
              value={whatsWrong}
              onChange={(e) => setWhatsWrong(e.target.value)}
            />
          )}
        </FormField>

        <FormField label="Tell us more" optional>
          {(p) => <Textarea {...p} name="details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />}
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
            leading={ready.map((r) => (
              <UploadTile key={r.id} upload={asReady(r, token)} grid ready onRemove={() => setReady((all) => all.filter((x) => x.id !== r.id))} />
            ))}
          />
        </div>

        <Choice
          label="Can we fix it if you're not home?"
          error={tried ? problems.letUsIn : null}
          value={letUsIn === null ? null : letUsIn ? "yes" : "no"}
          onChange={(v) => setLetUsIn(v === "yes")}
          options={[
            // Connor's words, Nov 21 (the exclamation point is his, against copy-rules.md's sent-screen-only rule).
            { value: "yes", title: "Yes, you can come in!", line: "The fastest option. We'll let the contractor in" },
            { value: "no", title: "No, please coordinate when I'm home", line: "This may take longer due to scheduling" },
          ]}
        />

        {letUsIn && (
          <>
            <Choice
              label="Any pets inside?"
              error={tried ? problems.pets : null}
              value={pets === null ? null : pets ? "yes" : "no"}
              onChange={(v) => setPets(v === "yes")}
              orientation="horizontal"
              options={[
                { value: "no", title: "No" },
                { value: "yes", title: "Yes" },
              ]}
            />
            {pets && (
              <FormField label="What pets?" optional>
                {(p) => <Input {...p} name="petsNote" autoComplete="off" placeholder="Cat, don't let her out" maxLength={120} value={petsNote} onChange={(e) => setPetsNote(e.target.value)} />}
              </FormField>
            )}
          </>
        )}

        {refusal && <SaveError>{refusal}</SaveError>}
        {/* Pinned above the keyboard on a phone; at the end of the form from sm. */}
        <div className="sticky bottom-0 -mx-4 bg-background px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:bg-transparent sm:p-0">
          <button type="submit" disabled={pending} className={cn(publicCtaClass, "w-full")}>
            {pending ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </main>
  );
}

type Option = { value: string; title: string; line?: string };

/**
 * One choice as rows (drawing 04 A): the stock radio group, each row a target as a whole, with its line saying what
 * the choice means. Neither is picked for them.
 */
function Choice({
  label,
  error,
  value,
  onChange,
  options,
  orientation = "vertical",
}: {
  label: string;
  error: string | null;
  value: string | null;
  onChange: (v: string) => void;
  options: Option[];
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onChange={onChange}
      isInvalid={!!error}
      orientation={orientation}
      className={cn("gap-2", orientation === "horizontal" && "grid-cols-2")}
    >
      <span className="text-label text-foreground">{label}</span>
      {orientation === "horizontal" && <span aria-hidden="true" />}
      {options.map((o) => (
        <Row key={o.value} picked={value === o.value} onPick={() => onChange(o.value)}>
          <RadioGroupItem value={o.value} aria-label={o.line ? `${o.title}${/[.!?]$/.test(o.title) ? "" : "."} ${o.line}` : o.title} />
          <span className="min-w-0">
            <span className="block text-body text-foreground">{o.title}</span>
            {o.line && <span className="block text-meta text-muted-foreground">{o.line}</span>}
          </span>
        </Row>
      ))}
      {error && <span className={cn("text-meta text-destructive", orientation === "horizontal" && "col-span-2")}>{error}</span>}
    </RadioGroup>
  );
}

/** A choice row: a tap anywhere on it picks it; the radio inside holds focus and the keyboard. */
function Row({ picked, onPick, children }: { picked: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onPick}
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        picked ? "border-primary" : "border-border pointer-fine:hover:bg-muted",
      )}
    >
      {children}
    </div>
  );
}

/** The sent screen (section 3.3): their first photo or the envelope art, a warm heading, and what happens next. */
function Sent({ token, firstName, whatsWrong, sent }: { token: string; firstName: string; whatsWrong: string; sent: { id: string; firstPhotoId: string | null } }) {
  const heading = useCallback((el: HTMLHeadingElement | null) => el?.focus({ preventScroll: true }), []);
  return (
    <main className={cn(residentColumn, "py-8 sm:py-10")}>
      {sent.firstPhotoId ? (
        // A private thumbnail behind the resident's link: next/image can't fetch it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/resident/${sent.firstPhotoId}?v=thumb&r=${encodeURIComponent(token)}`} alt="" className="aspect-[4/3] w-full rounded-xl bg-muted object-cover" />
      ) : (
        <SpotArt name="request-sent" className="size-24 text-gold" />
      )}
      <h1 ref={heading} tabIndex={-1} className={cn(publicType.heading, "mt-6 text-foreground outline-none")}>
        Thanks, {firstName}!
      </h1>
      <p className="mt-2 text-body text-fg-2">We have your request for &ldquo;{whatsWrong}.&rdquo;</p>
      <p className="mt-1 text-body text-fg-2">We&rsquo;ll email you when it&rsquo;s scheduled.</p>
      <Link href={`/r/${token}/${sent.id}`} className={cn(publicCtaClass, "mt-8 w-full")}>
        See your request
      </Link>
    </main>
  );
}

