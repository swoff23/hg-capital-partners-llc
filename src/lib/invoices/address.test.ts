import test from "node:test";
import assert from "node:assert/strict";
import { invoiceAddress } from "./address";

test("the invoice address is the invoice inbox on the sending domain", () => {
  assert.equal(invoiceAddress("HG Capital <jobs@mail.hgcapitalpartners.com>"), "invoices@mail.hgcapitalpartners.com");
  assert.equal(invoiceAddress("jobs@Mail.Example.com"), "invoices@mail.example.com");
});

test("with no sending domain it's the production one", () => {
  assert.equal(invoiceAddress(null), "invoices@mail.hgcapitalpartners.com");
  assert.equal(invoiceAddress(""), "invoices@mail.hgcapitalpartners.com");
  assert.equal(invoiceAddress("not an address"), "invoices@mail.hgcapitalpartners.com");
});
