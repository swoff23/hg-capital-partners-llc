"use client";
import type { MediaItem } from "@/components/lightbox";
import { LazyLightbox } from "@/components/lightbox-lazy";
import type { LockboxPhoto } from "@/lib/property-types";

/** Where a lockbox photo or its thumbnail is, for staff. */
export function lockboxPhotoUrl(propertyId: string, pathname: string): string {
  return `/api/files/property-lockbox/${encodeURIComponent(propertyId)}?p=${encodeURIComponent(pathname)}`;
}

/**
 * The photo full screen, one item, titled "Lockbox photo" over where the box
 * is. The viewer is fetched with the first open (LazyLightbox).
 */
export function LockboxPhotoViewer({
  propertyId,
  photo,
  location,
  isOpen,
  onOpenChange,
}: {
  propertyId: string;
  photo: LockboxPhoto;
  location: string | null | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const item: MediaItem = { id: photo.pathname, kind: "IMAGE", filename: "Lockbox photo.jpg", hasThumb: !!photo.thumbPathname, createdAt: "" };
  return (
    <LazyLightbox
      items={[item]}
      index={0}
      onIndexChange={() => {}}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      urlFor={(_item, variant) => lockboxPhotoUrl(propertyId, variant === "thumb" && photo.thumbPathname ? photo.thumbPathname : photo.pathname)}
      header={{ title: "Lockbox photo", byline: location?.trim() || undefined }}
    />
  );
}
