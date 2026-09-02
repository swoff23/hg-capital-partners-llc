"use client";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { Attachments, type AttachmentItem } from "@/components/attachments";
import { recordPropertyAttachment, deletePropertyAttachment } from "../actions";

/** Documents for a property — file uploads (Vercel Blob), same as task attachments. */
export function PropertyDocumentsSection({
  propertyId,
  attachments,
}: {
  propertyId: string;
  attachments: AttachmentItem[];
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Documents</CardTitle>
        {attachments.length > 0 && (
          <span className="text-xs text-muted">{attachments.length}</span>
        )}
      </CardHeader>
      <CardBody>
        <Attachments
          kind="property"
          items={attachments}
          uploadPathPrefix={`properties/${propertyId}`}
          clientPayload={JSON.stringify({ propertyId })}
          onRecord={(data) => recordPropertyAttachment(propertyId, data)}
          onDelete={(id) => deletePropertyAttachment(id)}
        />
      </CardBody>
    </Card>
  );
}
