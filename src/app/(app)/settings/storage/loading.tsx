import { Block, LoadingScreen } from "@/components/skeleton";
import { Section } from "@/components/ui";

/** Storage while its count loads (docs/specs/performance.md 4.3): Documents draws at once, its status line is a block. */
export default function StorageLoading() {
  return (
    <LoadingScreen className="space-y-8 pointer-coarse:space-y-6">
      <Section title="Documents">
        <div className="max-w-prose space-y-3">
          <Block text="text-body" className="w-56" />
        </div>
      </Section>
    </LoadingScreen>
  );
}
