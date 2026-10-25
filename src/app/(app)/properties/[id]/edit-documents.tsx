"use client";
import { Section } from "@/components/ui";
import { Attachments, type AttachmentItem } from "@/components/attachments";
import { recordPropertyAttachment, deletePropertyAttachment } from "../actions";
import { Count } from "./record-ui";

/** Documents for a property: file uploads (Vercel Blob), same as task attachments. */
export function PropertyDocumentsSection({
  propertyId,
  attachments,
}: {
  propertyId: string;
  attachments: AttachmentItem[];
}) {
  return (
    <Section
      title={
        <>
          Documents
          {attachments.length > 0 && <Count n={attachments.length} />}
        </>
      }
    >
      <Attachments
        kind="property"
        items={attachments}
        uploadPathPrefix={`properties/${propertyId}`}
        clientPayload={JSON.stringify({ propertyId })}
        onRecord={(data) => recordPropertyAttachment(propertyId, data)}
        onDelete={(id) => deletePropertyAttachment(id)}
      />
    </Section>
  );
}
