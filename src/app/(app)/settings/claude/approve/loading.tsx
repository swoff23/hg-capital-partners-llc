import { Block, LoadingScreen } from "@/components/skeleton";

/** The approval card while it reads the pending request. */
export default function ApproveLoading() {
  return (
    <LoadingScreen>
      <div className="mx-auto w-full max-w-md space-y-4 rounded-lg border border-border p-6">
        <Block text="text-title" className="w-3/4" />
        <Block text="text-body" className="w-full" />
        <Block text="text-body" className="w-2/3" />
      </div>
    </LoadingScreen>
  );
}
