import { Block, LoadingScreen } from "@/components/skeleton";

/** Settings › Claude while the partners load: two rows, name and state. */
export default function ClaudeLoading() {
  return (
    <LoadingScreen>
      <div className="border-b border-border">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 border-t border-border py-3">
            <Block text="text-body" className="w-28" />
            <Block text="text-body" className="w-40" />
          </div>
        ))}
      </div>
    </LoadingScreen>
  );
}
