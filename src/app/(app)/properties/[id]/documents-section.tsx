import { prisma } from "@/lib/db";
import { PropertyDocumentsSection } from "./edit-documents";

/**
 * A property's Documents (docs/specs/uploads-photos.md 2.4): loads the
 * property's files with who added each one and when, and shows them. A
 * server component, so the record page only names the property.
 *
 * Contract (build plan 1.5, UP1 finishes it): the section on the upload
 * queue, with "Add files", FilesList rows reading "Connor · Oct 3", a drop
 * target and delete through ConfirmDialog. Until then it is the section as
 * it was (edit-documents.tsx), and the uploader and date ride along unread.
 * Rows from before uploadedByUserId was recorded have no uploader.
 */
export async function DocumentsSection({ propertyId }: { propertyId: string }) {
  const rows = await prisma.propertyAttachment.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      filename: true,
      size: true,
      createdAt: true,
      uploadedByUser: { select: { name: true, email: true } },
    },
  });
  const attachments = rows.map((a) => ({
    id: a.id,
    filename: a.filename,
    size: a.size,
    createdAt: a.createdAt,
    uploadedBy: a.uploadedByUser ? a.uploadedByUser.name || a.uploadedByUser.email : null,
  }));
  return <PropertyDocumentsSection propertyId={propertyId} attachments={attachments} />;
}
