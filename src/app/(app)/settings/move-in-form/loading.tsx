import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";

/**
 * The move-in form while it loads (docs/specs/performance.md 4.3): each room
 * is a Section whose name comes from the form, so its heading is a block; its
 * Required row and its items' fields hold their places on the editor's own
 * rows (./move-in-form-editor.tsx).
 */
export default function MoveInFormLoading() {
  return (
    <LoadingScreen className="space-y-8 pointer-coarse:space-y-6">
      {[6, 4].map((items, s) => (
        <Section key={s} title={<Block text="text-section" className={rowWidth(s, ["w-20", "w-28"])} />}>
          <div aria-hidden="true" className="space-y-3">
            <div className="flex items-center gap-6 border-b border-line pb-3">
              <span className="flex min-h-8 items-center pointer-coarse:min-h-11">
                <Block text="text-body" className="w-20" />
              </span>
            </div>
            <div className="divide-y divide-line">
              {Array.from({ length: items }, (_, i) => (
                <div key={i} className="py-1.5 pointer-coarse:py-1">
                  <Block className="h-8 w-full rounded-md pointer-coarse:h-11" />
                </div>
              ))}
            </div>
          </div>
        </Section>
      ))}
    </LoadingScreen>
  );
}
