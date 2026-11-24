import test from "node:test";
import assert from "node:assert/strict";
import { crewText } from "./crew-text";

const base = {
  title: "Replace kitchen faucet",
  where: "118 Congress St, Buffalo, NY 14213 · Rear",
  due: "Fri, Nov 20",
  url: "https://hg.example.com/j/abc",
};

test("the crew text: the job, where and when, then the link (Connor, Nov 22, B)", () => {
  assert.equal(
    crewText(base),
    "Replace kitchen faucet\n118 Congress St, Buffalo, NY 14213 · Rear\nDue Fri, Nov 20\n\nDetails, photos and updates:\nhttps://hg.example.com/j/abc",
  );
});

test("their day leads instead of Due, and what isn't there is left out", () => {
  assert.equal(crewText({ ...base, scheduled: "Mon, Nov 23" }).split("\n")[2], "Scheduled Mon, Nov 23");
  assert.equal(
    crewText({ ...base, due: null }),
    "Replace kitchen faucet\n118 Congress St, Buffalo, NY 14213 · Rear\n\nDetails, photos and updates:\nhttps://hg.example.com/j/abc",
  );
});

test("a title on several lines is one line in the text", () => {
  assert.equal(crewText({ ...base, title: "Replace\n  kitchen   faucet" }).split("\n")[0], "Replace kitchen faucet");
});
