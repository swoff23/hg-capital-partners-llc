import test from "node:test";
import assert from "node:assert/strict";
import { contentDisposition } from "./http";

test("contentDisposition: ascii names pass through, both forms present", () => {
  assert.equal(
    contentDisposition("closing binder.pdf"),
    `inline; filename="closing binder.pdf"; filename*=UTF-8''closing%20binder.pdf`,
  );
  assert.equal(contentDisposition("a.pdf", "attachment").startsWith("attachment; "), true);
});

test("contentDisposition: non-ascii and quotes are made safe", () => {
  const cd = contentDisposition('Léase "2026".pdf');
  assert.equal(cd, `inline; filename="L_ase _2026_.pdf"; filename*=UTF-8''L%C3%A9ase%20%222026%22.pdf`);
});

test("contentDisposition: empty name falls back", () => {
  assert.equal(contentDisposition("").startsWith(`inline; filename="file"`), true);
});
