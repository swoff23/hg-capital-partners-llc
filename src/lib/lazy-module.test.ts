import test from "node:test";
import assert from "node:assert/strict";
import { lazyModule } from "./lazy-module";

test("lazyModule: nothing is fetched until it is asked for, then once for everyone", async () => {
  let fetched = 0;
  const m = lazyModule(async () => (fetched++, { name: "sheet" }));
  assert.equal(fetched, 0);
  assert.equal(m.loaded(), null);
  const [a, b] = await Promise.all([m.load(), m.load()]);
  assert.equal(a, b);
  assert.equal(fetched, 1);
  assert.deepEqual(m.loaded(), { name: "sheet" });
  await m.load();
  m.warm();
  assert.equal(fetched, 1);
});

test("lazyModule: warm starts the fetch, so the tap that follows finds it", async () => {
  let fetched = 0;
  const m = lazyModule(async () => (fetched++, 1));
  m.warm();
  await m.load();
  assert.equal(fetched, 1);
  assert.equal(m.loaded(), 1);
});

test("lazyModule: a fetch that fails is forgotten and the next ask tries again", async () => {
  let fetched = 0;
  const m = lazyModule(async () => {
    fetched++;
    if (fetched === 1) throw new Error("Loading chunk 7 failed.");
    return "ok";
  });
  await assert.rejects(m.load(), /chunk 7/);
  assert.equal(m.loaded(), null, "nothing to show from a failed fetch");
  assert.equal(await m.load(), "ok");
  assert.equal(fetched, 2);
});

test("lazyModule: warm never throws, even when the fetch fails", async () => {
  const m = lazyModule(async () => {
    throw new Error("offline");
  });
  m.warm();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.loaded(), null);
});

test("lazyModule: an importer that throws at once is the same failure", async () => {
  const m = lazyModule((): Promise<number> => {
    throw new Error("boom");
  });
  await assert.rejects(m.load(), /boom/);
});
