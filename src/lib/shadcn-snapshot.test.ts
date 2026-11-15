import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSnapshot, readRecord, record, sha256, stockFolder, targetPath } from "../../scripts/shadcn-snapshot/snapshot.mjs";

/* Stock shadcn/ui files stay exactly as `npx shadcn add` wrote them
   (docs/specs/design-foundation.md, sections 5.6 and 7.1). Each pull records
   every written file's hash in scripts/shadcn-snapshot/files.json; this fails
   on a stock file edited by hand, one missing from the record, or a recorded
   one that's gone. table.tsx is checked against its recorded edit. */

test("every stock file matches the hash recorded when it was pulled", () => {
  assert.deepEqual(checkSnapshot(), []);
});

test("stock files land in components/ui, hooks included", () => {
  const config = { aliases: { ui: "@/components/ui", hooks: "@/components/ui", lib: "@/lib", components: "@/components" } };
  assert.equal(stockFolder(), "src/components/ui");
  assert.equal(targetPath({ path: "registry/aria-vega/ui/button.tsx", type: "registry:ui" }, config), "src/components/ui/button.tsx");
  assert.equal(targetPath({ path: "registry/aria-vega/hooks/use-mobile.ts", type: "registry:hook" }, config), "src/components/ui/use-mobile.ts");
  assert.equal(targetPath({ path: "registry/base-vega/ui/table.tsx", type: "registry:ui" }, config), "src/components/ui/table.tsx");
});

/* A scratch checkout with a stubbed registry: `select` depends on `input`. */
const ITEMS: Record<string, { name: string; files: { path: string; type: string }[]; registryDependencies?: string[] }> = {
  input: { name: "input", files: [{ path: "registry/aria-vega/ui/input.tsx", type: "registry:ui" }] },
  select: { name: "select", files: [{ path: "registry/aria-vega/ui/select.tsx", type: "registry:ui" }], registryDependencies: ["input"] },
};

function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "shadcn-snapshot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "components.json"),
    JSON.stringify({ style: "aria-vega", aliases: { ui: "@/components/ui", hooks: "@/components/ui", lib: "@/lib", components: "@/components" } }),
  );
  mkdirSync(join(root, "src/components/ui"), { recursive: true });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const name = String(url).split("/").pop()!.replace(/\.json$/, "");
    return new Response(JSON.stringify(ITEMS[name]), { status: ITEMS[name] ? 200 : 404 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const write = (name: string, text: string) => writeFileSync(join(root, "src/components/ui", name), text);
  return { root, write };
}

test("recording an item never blesses a hand edit to a file it depends on", async (t) => {
  const { root, write } = scratch(t);
  write("input.tsx", "stock input");
  await record(["input"], { root });
  const before = readFileSync(join(root, "scripts/shadcn-snapshot/files.json"), "utf8");

  write("input.tsx", "stock input, edited by hand");
  write("select.tsx", "stock select");
  await assert.rejects(record(["select"], { root }), /input\.tsx: edited since `shadcn add` wrote it/);
  assert.equal(readFileSync(join(root, "scripts/shadcn-snapshot/files.json"), "utf8"), before, "nothing is written when a file has changed");
  assert.equal(checkSnapshot(root).length, 2, "the edit and the unrecorded select both show");

  // After `add --overwrite`, --update takes the new hashes.
  await record(["select"], { root, update: true });
  assert.deepEqual(checkSnapshot(root), []);
  assert.equal(readRecord(root)["src/components/ui/input.tsx"].sha256, sha256("stock input, edited by hand"));
});

test("a dependency that still matches keeps its entry and its edit note", async (t) => {
  const { root, write } = scratch(t);
  write("input.tsx", "stock input with its one edit");
  await record(["input"], { root, edit: "the recorded edit" });
  write("select.tsx", "stock select");
  const recorded = await record(["select"], { root });
  assert.deepEqual(recorded, ["src/components/ui/select.tsx"]);
  assert.equal(readRecord(root)["src/components/ui/input.tsx"].edit, "the recorded edit");
});

test("dotfiles in the stock folder aren't stock files", async (t) => {
  const { root, write } = scratch(t);
  write("input.tsx", "stock input");
  await record(["input"], { root });
  write(".DS_Store", "Finder");
  assert.deepEqual(checkSnapshot(root), []);
});
