"use client";
import type { ReactNode } from "react";
import { Mail, MapPin, MessageSquareText, Phone } from "lucide-react";
import { InlineField, InlineSwitch, type InlineFieldProps } from "@/components/inline-field";
import { RailFact, RailList } from "@/components/rail";
import { Section, buttonClass } from "@/components/ui";
import { cleanTrades, mailtoHref, mapsHref, telHref, textHref } from "@/lib/contacts";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";
import { patchContact } from "../actions";

/** The Contact columns staff can edit, as the page loaded them. */
export type EditableContact = {
  id: string;
  fullName: string;
  company: string | null;
  trades: string | null;
  phone: string | null;
  /** The number Call and Text dial: the digits only, without an extension or a note like "cell". */
  phoneE164: string | null;
  email: string | null;
  mailingAddress: string | null;
  billingInfo: string | null;
  availability: string | null;
  tenantFixes: boolean;
  /** The notes without the import's "W-9 on file:" lines, which the editor never sees. */
  comments: string | null;
};

type Field = "fullName" | "company" | "trades" | "phone" | "email" | "mailingAddress" | "billingInfo" | "availability" | "comments" | "tenantFixes";

/** Saves one field with the text it loaded, so a partner's newer change refuses it and says so. */
const saveField = (id: string, field: Field) => (next: string, expected: string) =>
  patchContact(id, { [field]: next }, { [field]: expected });

/** A small link beside a value that does what the value used to do when it was the link: call, text, write, open Maps. */
const actionLink = cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "text-fg-3");

/** The contractor's name, the page's h1, edited in place. */
export function ContactName({ id, name }: { id: string; name: string }) {
  return (
    <InlineField
      kind="heading"
      label="Name"
      field="fullName"
      context="Contractor name"
      value={name}
      minLength={1}
      blank="Enter a name."
      onSave={saveField(id, "fullName")}
    />
  );
}

function Fact({
  contact,
  field,
  label,
  name,
  ...rest
}: { contact: EditableContact; field: Field; label: string; name?: string } & Omit<InlineFieldProps, "label" | "value" | "onSave" | "field">) {
  const value = contact[field as keyof EditableContact];
  return (
    <RailFact label={label}>
      <InlineField
        {...rest}
        label={name ?? label}
        field={field}
        context={rest.context ?? `Contact · ${contact.fullName}`}
        value={typeof value === "string" ? value : ""}
        onSave={saveField(contact.id, field)}
      />
    </RailFact>
  );
}

/**
 * The Contact section of a contractor's page (forms 4.6): each fact changed
 * where it stands, like a property's. Phone, email and address keep what
 * their text used to do as small links beside them (call, text, write, open
 * Maps), since a tap on the value now edits it. `children` is what isn't
 * edited here: the W-9 and insurance rows, which the uploads work will take.
 */
export function ContactSection({
  contact,
  portalEmail,
  children,
}: {
  contact: EditableContact;
  /** The portal sign-in email, which this section doesn't change; null without a login. */
  portalEmail: string | null;
  children?: ReactNode;
}) {
  const phone = contact.phone?.trim() || null;
  const first = firstName(contact.fullName) || contact.fullName;
  // Call and Text dial the clean number; a typed extension would otherwise run into the digits.
  const dial = contact.phoneE164 ?? phone;
  const tel = telHref(dial);
  const sms = textHref(dial);
  return (
    <Section title="Contact">
      <RailList>
        <Fact contact={contact} field="company" label="Company" kind="text" empty="Add company" />
        <Fact
          contact={contact}
          field="trades"
          label="Trades"
          kind="text"
          empty="Add trades"
          helper="Separate trades with a slash."
          display={(text) => cleanTrades(text) ?? text}
        />
        <Fact
          contact={contact}
          field="phone"
          label="Phone"
          kind="phone"
          empty="Add phone"
          display={(text) => <span className="num">{text}</span>}
          trailing={
            phone && (
              <>
                {tel && (
                  <a href={tel} aria-label={`Call ${first}`} title={`Call ${phone}`} className={actionLink}>
                    <Phone aria-hidden="true" className="size-4" />
                  </a>
                )}
                {/* Touch only, where a tap opens Messages (ADMIN-004). */}
                {sms && (
                  <a href={sms} aria-label={`Text ${first}`} title="Text" className={cn(actionLink, "pointer-fine:hidden")}>
                    <MessageSquareText aria-hidden="true" className="size-4" />
                  </a>
                )}
              </>
            )
          }
        />
        <Fact
          contact={contact}
          field="email"
          label="Email"
          kind="email"
          empty="Add email"
          helper={portalEmail ? `Portal sign-in stays ${portalEmail}` : undefined}
          trailing={
            mailtoHref(contact.email) && (
              <a href={mailtoHref(contact.email)!} aria-label={`Email ${first}`} title="Write" className={actionLink}>
                <Mail aria-hidden="true" className="size-4" />
              </a>
            )
          }
        />
        <Fact
          contact={contact}
          field="mailingAddress"
          label="Address"
          name="Mailing address"
          kind="multiline"
          inRail={false}
          empty="Add address"
          trailing={
            mapsHref(contact.mailingAddress) && (
              <a
                href={mapsHref(contact.mailingAddress)!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the address in Maps"
                title="Open in Maps"
                className={actionLink}
              >
                <MapPin aria-hidden="true" className="size-4" />
              </a>
            )
          }
        />
        <Fact contact={contact} field="billingInfo" label="Billing" kind="text" empty="Add billing" helper="How they're paid. No account numbers." />
        <Fact contact={contact} field="availability" label="Availability" kind="text" empty="Add availability" />
        <RailFact label="Tenant fixes">
          <InlineSwitch
            label="Tenant fixes"
            field="tenantFixes"
            value={contact.tenantFixes ? "yes" : "no"}
            onSave={saveField(contact.id, "tenantFixes")}
          />
        </RailFact>
        {children}
      </RailList>
    </Section>
  );
}

/** The contractor's notes: Save or ⌘↵, never on blur, so a stray tap can't rewrite them. The "Add a note" verb stays. */
export function ContactNotes({ contact }: { contact: EditableContact }) {
  return (
    <Section title="Notes">
      <InlineField
        kind="multiline"
        label="Notes"
        field="comments"
        context={`Notes · ${contact.fullName}`}
        value={contact.comments ?? ""}
        empty="Add a note"
        inRail={false}
        onSave={saveField(contact.id, "comments")}
      />
    </Section>
  );
}
