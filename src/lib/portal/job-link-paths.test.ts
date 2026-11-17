import test from "node:test";
import assert from "node:assert/strict";
import { jobLinkDestination, jobLinkStep, jobLinkUrl, linkSessionMayOpen } from "./job-link-paths";

test("a link opens the job ready for its button's step, and nothing else gets into the path", () => {
  assert.equal(jobLinkDestination("t1", null), "/p/jobs/t1");
  assert.equal(jobLinkDestination("t1", "done"), "/p/jobs/t1?do=done");
  assert.equal(jobLinkDestination("t1", "share"), "/p/jobs/t1?do=share");
  assert.equal(jobLinkDestination("t1", "access"), "/p/jobs/t1#access");
  assert.equal(jobLinkDestination("t1", "photos"), "/p/jobs/t1#updates");
  assert.equal(jobLinkDestination("t1", null, "e7"), "/p/jobs/t1#update-e7");
  // An unknown step or an odd update id is left off.
  assert.equal(jobLinkDestination("t1", "approve"), "/p/jobs/t1");
  assert.equal(jobLinkDestination("t1", null, "e7#x?y"), "/p/jobs/t1");
  assert.equal(jobLinkStep("photos"), "photos");
  assert.equal(jobLinkStep(undefined), null);
});

test("a link session opens its own job and what's under it, nothing else", () => {
  assert.ok(linkSessionMayOpen("/p/jobs/t1", "t1"));
  assert.ok(linkSessionMayOpen("/p/jobs/t1?do=done", "t1"));
  assert.ok(linkSessionMayOpen("/p/jobs/t1/anything", "t1"));
  assert.ok(!linkSessionMayOpen("/p", "t1"));
  assert.ok(!linkSessionMayOpen("/p/jobs/t2", "t1"));
  assert.ok(!linkSessionMayOpen("/p/jobs/t10", "t1"));
  assert.ok(!linkSessionMayOpen("/p/welcome/password", "t1"));
  assert.ok(!linkSessionMayOpen(null, "t1"));
});

test("a link's URL: the token, then the step and the update to open at", () => {
  const T = "a".repeat(43);
  assert.equal(jobLinkUrl("https://hg.example.com/", T), `https://hg.example.com/j/${T}`);
  assert.equal(jobLinkUrl("https://hg.example.com", T, "done"), `https://hg.example.com/j/${T}?do=done`);
  assert.equal(jobLinkUrl("https://hg.example.com", T, null, "e7"), `https://hg.example.com/j/${T}?u=e7`);
});
