"use client";
import { useOptimistic, useState, useTransition } from "react";
import { Check, Copy, MapPin, MessageSquareText, Navigation, Phone } from "lucide-react";
import { Code } from "@/components/code";
import type { MediaItem } from "@/components/lightbox";
import { LazyLightbox } from "@/components/lightbox-lazy";
import { Meter } from "@/components/meter";
import { useToast } from "@/components/toast";
import { Button, Checkbox, LinkButton, Section, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { telHref, textHref } from "@/lib/contacts";
import type { JobLockbox, JobTenants } from "@/lib/portal/queries";
import { firstName } from "@/lib/portal/job-view";
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
 * Directions (Apple Maps; other phones get the web map) and Copy address.
 * On a phone the two share the row, so at 320 neither runs into the gutter;
 * below 360 Copy address shortens to Copy, its name staying whole.
 */
export function AddressActions({ address }: { address: string }) {
  const copy = useCopy();
  return (
    <div className="mt-3 flex items-center gap-2">
      <LinkButton
        href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 whitespace-nowrap sm:flex-none"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" />
        Directions
      </LinkButton>
      <Button
        variant="secondary"
        aria-label="Copy address"
        className="min-w-0 flex-1 whitespace-nowrap sm:flex-none"
        onClick={() => copy(address, "Address copied")}
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        {/* Tailwind's max-[360px] is width < 360, so the pair meets at 360 without both showing. */}
        <span className="max-[360px]:hidden">Copy address</span>
        <span className="min-[360px]:hidden">Copy</span>
      </Button>
    </div>
  );
}

/**
 * D21: the lockbox code, large, through Code. It's typed into the box by
 * hand, so there's no Copy button (Connor, Oct 26) and no hover copy icon;
 * a tap on the code still copies it, as every Code does. Code's button names
 * the code for screen readers. A long code wraps inside its column, so every
 * character shows.
 *
 * Where the box is sits under the code, and its photo beside it, 96x72; a tap
 * opens the photo full screen in the viewer, zoom included
 * (docs/specs/lockbox-location.md, decision 1). The same block at every
 * width. The photo comes from /api/files/lockbox/<job>, which shows it under
 * the code's own rule. No photo, or one whose file won't load, shows no tile
 * at all (Connor, Nov 15): the contractor never meets an empty box.
 */
/**
 * Who lives there (docs/specs/tenant-contact.md section 3, Q26): one row per
 * person, the name over the number, with Call and Text on the right. Text is
 * touch only, where a tap opens Messages (Q13); with a mouse the number reads
 * in full beside Call. A tenant with no number on file shows by name alone
 * (tenants.md call 2). Above Lockbox; `#access` from an email lands here.
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
                <a href={sms} aria-label={`Text ${first}`} className={cn(iconLink, "pointer-fine:hidden")}>
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

export function LockboxSection({ taskId, lockbox, permittedBy = 0 }: { taskId: string; lockbox: JobLockbox; permittedBy?: number }) {
  const [viewing, setViewing] = useState(false);
  const [broken, setBroken] = useState(false);
  const url = `/api/files/lockbox/${encodeURIComponent(taskId)}`;
  const photo = broken ? null : lockbox.photo;
  const item: MediaItem = { id: "lockbox", kind: "IMAGE", filename: "Lockbox photo.jpg", hasThumb: !!photo?.hasThumb, createdAt: "" };
  return (
    <Section id="lockbox" title="Lockbox">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Code value={lockbox.code} label="Lockbox code" size="lg" copyIcon={false} wrap className="min-w-0" />
          {/* At an occupied home the code shows only with their Permission to enter, and this says so (Connor, Nov 17). */}
          {permittedBy > 0 && (
            <p className="mt-2 text-body text-ok">{permittedBy === 1 ? "The tenant said you can let yourself in" : "The tenants said you can let yourself in"}</p>
          )}
          {lockbox.location && (
            <p className="mt-2 flex items-start gap-1.5 text-body text-foreground">
              <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 break-words">{lockbox.location}</span>
            </p>
          )}
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
      {photo && (
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
 * boxes dim to 50% (the one dim level). Progress is the shared Meter under
 * the heading (charts 2.3), springing with each tick; at the last tick the
 * count becomes a check and "All done" in --ok, at the count's weight.
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
      {shown.length > 0 && (
        <Meter
          value={doneCount}
          max={shown.length}
          label="Checklist progress"
          valueText={`${doneCount} of ${shown.length} done`}
          spring
          className="mb-1"
        />
      )}
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
