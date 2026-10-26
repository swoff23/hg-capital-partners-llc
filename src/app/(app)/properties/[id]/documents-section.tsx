import type { FileLink } from "@/components/files-list";
import { propertyFileUrl } from "@/lib/attachments/media";
import { prisma } from "@/lib/db";
import { shortAddress } from "@/lib/normalize";
import { PropertyDocumentsSection } from "./edit-documents";

/**
 * A property's Documents (docs/specs/uploads-photos.md 2.4): loads the
 * property's files with who added each one and when, and shows them. A
 * server component, so the record page only names the property.
 *
 * Rows read "Connor · Oct 3" (PropertyAttachment.uploadedByUserId); rows from
 * before it was recorded have no uploader and show the date alone. The client
 * section puts them on the upload queue (edit-documents.tsx).
 */
export async function DocumentsSection({ propertyId }: { propertyId: string }) {
  const [property, rows] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { address: true } }),
    prisma.propertyAttachment.findMany({
      where: { propertyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filename: true,
        size: true,
        createdAt: true,
        uploadedByUser: { select: { name: true, email: true } },
      },
    }),
  ]);
  const files: FileLink[] = rows.map((a) => ({
    id: a.id,
    kind: "FILE",
    filename: a.filename,
    href: propertyFileUrl(a.id),
    size: a.size,
    internal: false,
    createdAt: a.createdAt,
    uploadedBy: a.uploadedByUser ? a.uploadedByUser.name || a.uploadedByUser.email : null,
  }));
  return <PropertyDocumentsSection propertyId={propertyId} label={property ? shortAddress(property.address) : ""} files={files} />;
}
