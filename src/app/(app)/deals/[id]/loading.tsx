import { LoadingScreen } from "@/components/skeleton";
import { DealsListSkeleton } from "../(list)/loading";

/**
 * A deal loading on a full load (a reload, a pasted link): the deals list's
 * skeleton, since the deal opens as a sheet over the list (page.tsx), with
 * no page of its own.
 */
export default function DealLoading() {
  return (
    <LoadingScreen>
      <DealsListSkeleton />
    </LoadingScreen>
  );
}
