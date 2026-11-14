import { Block, LoadingScreen } from "@/components/skeleton";
import { PageHeader } from "@/components/ui";

/** A field's label over its control, at the form's own heights. */
function FieldBlock() {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Block text="text-meta" className="w-16" />
      <Block className="h-9 w-full rounded-md pointer-coarse:h-11" />
    </div>
  );
}

/** New lease while the page loads: its title and the Where, Tenants and Dates fields, as the form lays them out. */
export default function NewLeaseLoading() {
  return (
    <LoadingScreen>
      <div className="max-w-xl">
        <PageHeader title="New lease" />
        <div aria-hidden="true" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock />
            <FieldBlock />
          </div>
          <FieldBlock />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock />
            <FieldBlock />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock />
            <FieldBlock />
          </div>
        </div>
      </div>
    </LoadingScreen>
  );
}
