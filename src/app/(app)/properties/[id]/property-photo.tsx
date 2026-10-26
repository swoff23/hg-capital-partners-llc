import { PhotoThumb } from "@/components/photo-thumb";
import { shortAddress } from "@/lib/normalize";

/**
 * The building's front photo in the record header
 * (docs/specs/uploads-photos.md 2.10): full width at 16:9 on a phone, often
 * held at the building, and 96x72 beside the title from sm. The fallback
 * tile until a photo is set.
 *
 * Contract (build plan 1.5, UP2 finishes it): for staff (`canEdit`) the tile
 * is a button with "Add photo" in the empty tile, opening Upload photo,
 * Choose from photos taken here and Remove photo. Until then it shows the
 * photo, or the fallback tile, and does nothing.
 */
export function PropertyPhoto({
  property,
  canEdit = false,
}: {
  property: { id: string; address: string; photoUrl: string | null };
  canEdit?: boolean;
}) {
  void canEdit;
  const place = shortAddress(property.address) || property.address;
  const alt = `Front of ${place}`;
  return (
    <>
      <PhotoThumb size="full" src={property.photoUrl} alt={alt} className="sm:hidden" />
      <PhotoThumb size={96} src={property.photoUrl} alt={alt} className="max-sm:hidden" />
    </>
  );
}
