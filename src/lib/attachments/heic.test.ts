import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isHeicFile, looksLikeHeic } from "./heic";

/** An ISO BMFF file's first 12 bytes: a box size, "ftyp", then the brand. */
const head = (brand: string) => new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftyp"), ...Buffer.from(brand)]);

test("looksLikeHeic: the HEIC and HEIF brands an iPhone and other cameras write", () => {
  for (const brand of ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"]) {
    assert.equal(looksLikeHeic(head(brand)), true, brand);
  }
  assert.equal(looksLikeHeic(head("HEIC")), true, "brands read case-insensitively");
});

test("looksLikeHeic: other files, and too few bytes, are not HEIC", () => {
  assert.equal(looksLikeHeic(head("isom")), false, "an MP4");
  assert.equal(looksLikeHeic(head("qt  ")), false, "a MOV");
  assert.equal(looksLikeHeic(head("avif")), false, "an AVIF");
  assert.equal(looksLikeHeic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])), false, "a JPEG");
  assert.equal(looksLikeHeic(head("hei")), false, "11 bytes");
  assert.equal(looksLikeHeic(new Uint8Array()), false);
});

test("isHeicFile: reads the first bytes of a Blob, whatever it's named", async () => {
  assert.equal(await isHeicFile(new Blob([head("heic"), new Uint8Array(100)])), true);
  assert.equal(await isHeicFile(new Blob([head("isom"), new Uint8Array(100)])), false);
});

test("heic-to is reached only through the dynamic import in heic.ts", () => {
  const root = join(__dirname, "..", "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) {
        const src = readFileSync(p, "utf8");
        const statics = /^\s*(?:import|export)\b[^;]*?from\s*["']heic-to(?:\/[^"']*)?["']/m.test(src);
        const dynamics = /import\(\s*["']heic-to(?:\/[^"']*)?["']\s*\)/.test(src);
        if (statics || (dynamics && !p.endsWith(join("attachments", "heic.ts")))) offenders.push(p.slice(root.length + 1));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
