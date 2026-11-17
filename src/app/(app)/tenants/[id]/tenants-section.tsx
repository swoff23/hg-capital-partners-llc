"use client";
import { useState } from "react";
import { Mail, MessageSquareText, Phone } from "lucide-react";
import { Section, AddRow, buttonClass, tagClass } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { mailtoHref, telHref, textHref } from "@/lib/contacts";
import { MAX_TENANTS } from "@/lib/tenants/fields";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";
import { TenantSheet, type TenantRow } from "./tenant-sheet";

/** A small link beside a person that does what their phone or email used to do as a link. */
const actionLink = cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-muted-foreground");

/**
 * The Tenants section: one row per person, the primary first, each opening
 * its sheet. Call, Text and Email sit at the right as on a contractor's
 * record; Text only where a tap opens Messages (touch). "Add tenant" under
 * the rows opens the same sheet empty.
 */
export function TenantsSection({ leaseId, tenants }: { leaseId: string; tenants: TenantRow[] }) {
  // One sheet, remounted per open (`n`) so it starts from the person as the page has them now.
  const [sheet, setSheet] = useState<{ n: number; open: boolean; tenant: TenantRow | null }>({ n: 0, open: false, tenant: null });
  const coarse = useCoarsePointer();
  const openFor = (tenant: TenantRow | null) => setSheet((s) => ({ n: s.n + 1, open: true, tenant }));

  return (
    <Section title="Tenants">
      <ul className="-mt-1">
        {tenants.map((t) => {
          const dial = t.phoneE164 ?? t.phone;
          const tel = telHref(dial);
          const sms = textHref(dial);
          const mail = mailtoHref(t.email);
          const first = firstName(t.fullName) || t.fullName;
          const meta = [t.phone, t.email].filter(Boolean).join(" · ");
          return (
            <li key={t.id} className="flex items-center gap-1 border-b border-border">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => openFor(t)}
                className="-mx-2 my-0.5 flex min-h-12 min-w-0 flex-1 flex-col items-start justify-center rounded-md px-2 py-1.5 text-left transition-colors pointer-fine:hover:bg-muted"
              >
                <span className="flex max-w-full min-w-0 items-center gap-2">
                  <span className="truncate text-body text-foreground">{t.fullName}</span>
                  {t.primary && <span className={tagClass}>Primary</span>}
                </span>
                {meta && <span className="num max-w-full truncate text-meta text-muted-foreground">{meta}</span>}
              </button>
              <div className="flex shrink-0 items-center">
                {tel && (
                  <a href={tel} aria-label={`Call ${first}`} title={`Call ${t.phone ?? ""}`.trim()} className={actionLink}>
                    <Phone aria-hidden="true" className="size-4" />
                  </a>
                )}
                {/* Touch only, where a tap opens Messages; left out, not hidden, so a mouse never tabs to it. */}
                {sms && coarse && (
                  <a href={sms} aria-label={`Text ${first}`} title="Text" className={actionLink}>
                    <MessageSquareText aria-hidden="true" className="size-4" />
                  </a>
                )}
                {mail && (
                  <a href={mail} aria-label={`Email ${first}`} title="Write" className={actionLink}>
                    <Mail aria-hidden="true" className="size-4" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {tenants.length < MAX_TENANTS && <AddRow onClick={() => openFor(null)} className="border-t-0">Add tenant</AddRow>}
      {sheet.n > 0 && (
        <TenantSheet
          key={sheet.n}
          leaseId={leaseId}
          tenant={sheet.tenant}
          isOpen={sheet.open}
          onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        />
      )}
    </Section>
  );
}
