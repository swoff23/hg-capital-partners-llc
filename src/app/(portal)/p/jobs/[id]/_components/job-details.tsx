"use client";
import { useOptimistic, useState, useTransition } from "react";
import { Check, Copy, MessageSquareText, Navigation, Phone } from "lucide-react";
import { Code } from "@/components/code";
import type { MediaItem } from "@/components/lightbox";
import { LazyLightbox } from "@/components/lightbox-lazy";
import { useToast } from "@/components/toast";
import { Button, Checkbox, Section, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { telHref, textHref } from "@/lib/contacts";
import type { JobLockbox, JobTenants } from "@/lib/portal/queries";
import { firstName, gettingInWords } from "@/lib/portal/job-view";
import { cn } from "@/lib/utils";
import { setChecklistItemAction } from "../actions";

/** Writes to the clipboard and says so in a toast; says what to do when the browser refuses. */
function useCopy() {
  const { toast } = useToast();
  return async (text: string, done: string, failed = "Couldn't copy. Select the text to copy it instead.") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: done });
    } catch {
      toast({ message: failed });
    }
  };
}

/**
 * The job card's first row (Connor, Nov 22, card B): "Address" over the street
 * and unit (`line`, the short address: every job is in Buffalo), and
 * Directions (Apple Maps; other phones get the web map) and Copy address as
 * square icon buttons, the tenant rows' own. Copy and Directions take the
 * full address. It's one line where it fits; on a narrow phone it wraps to a
 * second line rather than cut off (Connor, Nov 22: the whole address has to
 * show). With no address on file (a unit alone), just the words.
 */
export function AddressRow({ address, line }: { address: string | null; line: string }) {
  const copy = useCopy();
  const iconLink = buttonClass({ variant: "secondary", icon: true });
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-meta text-muted-foreground">Address</p>
        <p className="mt-0.5 break-words text-body text-foreground">{line}</p>
      </div>
      {address && (
        <>
          <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" aria-label="Directions" className={iconLink}>
            <Navigation aria-hidden="true" className="size-4" />
          </a>
          <Button variant="secondary" icon aria-label="Copy address" onClick={() => copy(address, "Address copied")}>
            <Copy aria-hidden="true" className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Who lives there (docs/specs/tenant-contact.md section 3, Q26): one row per
 * person, the name over the number, with Call and Text on the right at every
 * size (Connor, Nov 21, replacing Q13's touch only). A tenant with no number on file shows by name alone
 * (tenants.md call 2). Under Getting in (Connor, Nov 22); `#access` lands here only when Getting in shows nothing.
 */
export function TenantsSection({ tenants }: { tenants: JobTenants }) {
  const iconLink = buttonClass({ variant: "secondary", icon: true });
  return (
    <Section id="tenants" title={tenants.people.length === 1 ? "Tenant" : "Tenants"}>
      <ul className="divide-y divide-border">
        {tenants.people.map((t, i) => {
          const first = firstName(t.name) || t.name;
          const tel = telHref(t.dial);
          const sms = textHref(t.dial);
          return (
            <li key={i} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-foreground">{t.name}</p>
                {t.phone && <p className="num whitespace-nowrap text-meta text-fg-2">{t.phone}</p>}
              </div>
              {tel && (
                <a href={tel} aria-label={`Call ${first}`} className={iconLink}>
                  <Phone aria-hidden="true" className="size-4" />
                </a>
              )}
              {sms && (
                <a href={sms} aria-label={`Text ${first}`} className={iconLink}>
                  <MessageSquareText aria-hidden="true" className="size-4" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * "Getting in" (Connor, Nov 22, B, no icons): how they get in, first, then the
 * lockbox. With Permission to enter, "Let yourself in" in --ok (the tone this
 * line had on the Lockbox, Nov 17) over who said so; at a home someone lives
 * in without it, someone must be home, after 24 hours' notice (Q7), and the
 * code stays hidden; nobody living there with a code, "Let yourself in" over
 * "No one lives here". Then the code through Code, large: it's typed into the
 * box by hand, so there's no Copy button (Connor, Oct 26) and no hover copy
 * icon; a tap on the code still copies it, as every Code does. Where the box
 * is sits under the code, and its photo beside it, 96x72; a tap opens the
 * photo full screen in the viewer, zoom included (docs/specs/lockbox-location.md,
 * decision 1). The photo comes from /api/files/lockbox/<job>, which shows it
 * under the code's own rule. No photo, or one whose file won't load, shows no
 * tile at all (Connor, Nov 15). Keeps the `lockbox` anchor, so an email's
 * Show access lands here. `rule` is false once the job is closed.
 */
export function GettingInSection({
  taskId,
  lockbox,
  tenants,
  needsNotice,
  vacant,
  rule = true,
  pets = null,
}: {
  taskId: string;
  lockbox: JobLockbox | null;
  tenants: JobTenants;
  needsNotice: boolean;
  /** The job's unit is known and nobody lives there. A code with no known household (a building-wide job) gets no entry line. */
  vacant: boolean;
  rule?: boolean;
  /** "Pets inside. Keep doors shut.": the resident's answer on their request (docs/specs/maintenance-requests.md, 4.6). */
  pets?: string | null;
}) {
  const [viewing, setViewing] = useState(false);
  const [broken, setBroken] = useState(false);
  // The same words the job emails use (job-view.ts gettingInWords). Permission with no code on file is no way in yet, so
  // nothing is said (as the Lockbox's line was, before).
  const words = rule ? gettingInWords({ permitted: tenants.permitted, hasLockbox: !!lockbox, needsNotice, vacant, tenants: tenants.people.length }) : null;
  const entry = words ? { ...words, ok: words.value === "Let yourself in" } : null;
  if (!entry && !lockbox) return null;
  const url = `/api/files/lockbox/${encodeURIComponent(taskId)}`;
  const photo = broken || !lockbox ? null : lockbox.photo;
  const item: MediaItem = { id: "lockbox", kind: "IMAGE", filename: "Lockbox photo.jpg", hasThumb: !!photo?.hasThumb, createdAt: "" };
  return (
    <Section id="lockbox" title="Getting in">
      {entry && (
        <div>
          <p className={cn("text-body", entry.ok ? "text-ok" : "text-foreground")}>{entry.value}</p>
          <p className="text-meta text-fg-2">{entry.note}</p>
        </div>
      )}
      {lockbox && (
        <div className={cn("flex items-start justify-between gap-3", entry && "mt-3")}>
          <div className="min-w-0 flex-1">
            <Code value={lockbox.code} label="Lockbox code" size="lg" copyIcon={false} wrap className="min-w-0" />
            {lockbox.location && <p className="mt-1 break-words text-meta text-fg-2">{lockbox.location}</p>}
            {pets && <p className="mt-2 text-body text-foreground">{pets}</p>}
          </div>
          {photo && (
            <button
              type="button"
              onClick={() => setViewing(true)}
              aria-label="Open lockbox photo"
              className="relative block aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md bg-muted"
            >
              {/* Gated, session-checked route; next/image would cache it publicly. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.hasThumb ? `${url}?v=thumb` : url}
                alt=""
                decoding="async"
                draggable={false}
                onError={() => setBroken(true)}
                className="h-full w-full object-cover"
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md inset-shadow-photo-edge" />
            </button>
          )}
        </div>
      )}
      {lockbox && photo && (
        <LazyLightbox
          items={[item]}
          index={0}
          onIndexChange={() => {}}
          isOpen={viewing}
          onOpenChange={setViewing}
          urlFor={(_item, variant) => (variant === "thumb" && photo.hasThumb ? `${url}?v=thumb` : url)}
          surface="portal"
          header={{ title: "Lockbox photo", byline: lockbox.location ?? undefined }}
        />
      )}
    </Section>
  );
}

type Item = { id: string; title: string; done: boolean };

/**
 * Tickable while the job is active; read-only once it's closed, when the
 * boxes dim to 50% (the one dim level). Progress is the count beside the
 * heading, with no bar (Connor, Nov 22: the bar distracted); at the last tick
 * the count becomes a check and "All done" in --ok, at the count's weight.
 */
export function JobChecklist({ items, editable }: { items: Item[]; editable: boolean }) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(items, (state, next: { id: string; done: boolean }) =>
    state.map((i) => (i.id === next.id ? { ...i, done: next.done } : i)),
  );
  const doneCount = shown.filter((i) => i.done).length;
  const allDone = shown.length > 0 && doneCount === shown.length;

  const toggle = (id: string, done: boolean) =>
    startTransition(async () => {
      setShown({ id, done });
      // On a failure the tick goes back by itself: the optimistic value only lasts as long as the transition.
      const res = await callAction(() => setChecklistItemAction(id, done));
      if (!res.ok) toast({ message: res.error });
    });

  return (
    <Section
      title={
        <>
          Checklist{" "}
          {allDone ? (
            <span className="ml-1 inline-flex items-center gap-1 align-baseline font-normal text-ok">
              <Check aria-hidden="true" strokeWidth={2} className="size-4 self-center" />
              All done
            </span>
          ) : (
            <span className="ml-1 font-normal tabular-nums text-muted-foreground">{`${doneCount}/${shown.length}`}</span>
          )}
        </>
      }
    >
      <ul>
        {shown.map((item) => (
          <li key={item.id}>
            <label className={cn("flex min-h-11 items-center gap-3 py-1", editable ? "cursor-pointer" : "cursor-default")}>
              {/* Drawn from the tokens, so the box is the same in every engine and in dark. */}
              <Checkbox large checked={item.done} disabled={!editable} onChange={(e) => toggle(item.id, e.target.checked)} />
              <span className={cn("text-body", item.done ? "text-muted-foreground line-through" : "text-foreground")}>{item.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}
