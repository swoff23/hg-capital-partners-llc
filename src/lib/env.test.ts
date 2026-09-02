import test from "node:test";
import assert from "node:assert/strict";
import { EnvError, parseEnv } from "./env";

const base = {
  NODE_ENV: "production",
  SESSION_SECRET: "x".repeat(43),
  DATABASE_URL: "postgresql://u:p@h/db",
};

test("empty strings are treated as unset", () => {
  const env = parseEnv({ ...base, HEALTH_TOKEN: "", CRON_SECRET: "" });
  assert.equal(env.HEALTH_TOKEN, undefined);
  assert.equal(env.CRON_SECRET, undefined);
});

test("sessionSecret throws in production when unset", () => {
  const env = parseEnv({ NODE_ENV: "production" });
  assert.throws(() => env.sessionSecret, EnvError);
});

test("sessionSecret falls back to the dev secret outside production", () => {
  const env = parseEnv({ NODE_ENV: "development" });
  assert.equal(typeof env.sessionSecret, "string");
  assert.ok(env.sessionSecret.length > 0);
  assert.equal(env.isProduction, false);
});

test("sessionSecret returns the configured value", () => {
  assert.equal(parseEnv(base).sessionSecret, base.SESSION_SECRET);
});

test("qbo is null unless every key is present", () => {
  assert.equal(parseEnv(base).qbo, null);
  assert.equal(
    parseEnv({ ...base, QBO_CLIENT_ID: "id", QBO_CLIENT_SECRET: "s", QBO_REDIRECT_URI: "https://x/cb" }).qbo,
    null,
  );
  const full = parseEnv({
    ...base,
    QBO_CLIENT_ID: "id",
    QBO_CLIENT_SECRET: "s",
    QBO_REDIRECT_URI: "https://x/cb",
    QBO_TOKEN_SECRET: "t",
  });
  assert.deepEqual(full.qbo, {
    clientId: "id",
    clientSecret: "s",
    redirectUri: "https://x/cb",
    tokenSecret: "t",
    environment: "sandbox",
    historyStart: "2026-01",
  });
});

test("QBO_ENVIRONMENT and QBO_HISTORY_START are validated", () => {
  assert.throws(() => parseEnv({ ...base, QBO_ENVIRONMENT: "prod" }), EnvError);
  assert.throws(() => parseEnv({ ...base, QBO_HISTORY_START: "2026-1" }), EnvError);
  assert.throws(() => parseEnv({ ...base, QBO_HISTORY_START: "2026-13" }), EnvError);
  assert.throws(() => parseEnv({ ...base, QBO_REDIRECT_URI: "not a url" }), EnvError);
  assert.equal(parseEnv({ ...base, QBO_ENVIRONMENT: "production", QBO_HISTORY_START: "2025-07" }).QBO_HISTORY_START, "2025-07");
});

test("NODE_ENV defaults to development", () => {
  const env = parseEnv({});
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.isProduction, false);
});
