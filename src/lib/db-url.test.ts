import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { Client } from "pg";
import {
  POOL_CONNECT_TIMEOUT_MS,
  POOL_MAX,
  TRANSACTION_MAX_WAIT_MS,
  dbConnectionSummary,
  dbViaOf,
  isPrivateHost,
  isSessionPooler,
  isTxPooler,
  productionPoolerWarning,
  runtimeDatabaseUrl,
  runtimePoolConfig,
  runtimeSchema,
} from "./db-url";

const SESSION = "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const TX = "postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
/** POSTGRES_PRISMA_URL as the Vercel Supabase integration writes it. */
const TX_INTEGRATION = `${TX}&pgbouncer=true`;
const DIRECT = "postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres";
const LOCAL = "postgresql://connorswofford@localhost:5432/hg_capital_uiux";

/** What node-postgres makes of a URL's TLS settings, without connecting. */
function sslOf(url: string): unknown {
  return (new Client({ connectionString: url }) as unknown as { connectionParameters: { ssl: unknown } }).connectionParameters.ssl;
}

test("production reads through the integration's transaction pooler, with no Rust-engine parameters", () => {
  const url = runtimeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX }) ?? "";
  assert.ok(url.startsWith("postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x"));
  assert.doesNotMatch(url, /pgbouncer|connection_limit/);
});

test("a Preview or local build never reads POSTGRES_PRISMA_URL, which names production", () => {
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: undefined, POSTGRES_PRISMA_URL: TX }), undefined);
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: undefined, DATABASE_URL: LOCAL, POSTGRES_PRISMA_URL: TX }), LOCAL);
  assert.equal(runtimePoolConfig({ VERCEL_ENV: "preview", POSTGRES_PRISMA_URL: TX }), null);
});

test("production without the integration URL keeps DATABASE_URL", () => {
  const url = runtimeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: SESSION }) ?? "";
  assert.ok(url.startsWith(SESSION + "?"));
});

test("a pgbouncer or connection_limit left in a URL is dropped, and the rest is kept in order", () => {
  const url = runtimeDatabaseUrl({ DATABASE_URL: TX.replace("?", "?pgbouncer=true&connection_limit=1&") }) ?? "";
  assert.doesNotMatch(url, /pgbouncer|connection_limit/);
  assert.match(url, /\?sslmode=require&supa=base-pooler\.x/);
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: LOCAL + "?pgbouncer=true" }), LOCAL);
});

test("sslmode=require keeps the engine's meaning: encrypted, certificate not checked", () => {
  const url = runtimeDatabaseUrl({ DATABASE_URL: TX }) ?? "";
  assert.match(url, /[?&]uselibpqcompat=true(&|$)/);
  assert.deepEqual(sslOf(url), { rejectUnauthorized: false });
  // Without the flag node-postgres would verify the chain against Node's public CAs.
  assert.deepEqual(sslOf(TX), {});
});

test("a remote URL with no sslmode still uses TLS; a local one stays plain", () => {
  const remote = runtimeDatabaseUrl({ DATABASE_URL: SESSION }) ?? "";
  assert.deepEqual(sslOf(remote), { rejectUnauthorized: false });
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: LOCAL }), LOCAL);
  assert.equal(sslOf(LOCAL), false);
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: "postgresql://u@127.0.0.1:15432/db" }), "postgresql://u@127.0.0.1:15432/db");
});

test("an explicit sslmode=disable or uselibpqcompat is left alone", () => {
  const off = `${SESSION}?sslmode=disable`;
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: off }), off);
  const own = `${SESSION}?sslmode=verify-full&uselibpqcompat=true`;
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: own }), own);
});

test("every deployment gets the same pool size", () => {
  assert.equal(runtimePoolConfig({ VERCEL_ENV: "production", POSTGRES_PRISMA_URL: TX })?.max, POOL_MAX);
  assert.equal(runtimePoolConfig({ DATABASE_URL: LOCAL })?.max, POOL_MAX);
  assert.equal(runtimePoolConfig({ DATABASE_URL: LOCAL })?.connectionString, LOCAL);
});

test("only the pooler host on 6543 counts as the transaction pooler", () => {
  assert.equal(isTxPooler(TX), true);
  assert.equal(isTxPooler(SESSION), false);
  assert.equal(isTxPooler(LOCAL), false);
});

test("the health detail names the driver, the route and the pool", () => {
  assert.deepEqual(dbConnectionSummary({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX }), {
    dbDriver: "node-postgres",
    dbVia: "transaction pooler",
    dbPool: POOL_MAX,
  });
  // Production without the integration's URL falls back to the session pooler, and health names it.
  assert.equal(dbConnectionSummary({ VERCEL_ENV: "production", DATABASE_URL: SESSION }).dbVia, "session pooler");
  assert.deepEqual(dbConnectionSummary({ VERCEL_ENV: "preview", POSTGRES_PRISMA_URL: TX }), { dbDriver: "none", dbVia: null, dbPool: null });
});

test("lows 3: only the pooler host on 5432 is the session pooler; a database host or a local one is direct", () => {
  assert.equal(dbViaOf(TX), "transaction pooler");
  assert.equal(dbViaOf(SESSION), "session pooler");
  assert.equal(dbViaOf(`${SESSION}?sslmode=require`), "session pooler");
  assert.equal(dbViaOf(DIRECT), "direct");
  assert.equal(dbViaOf(LOCAL), "direct");
  assert.equal(isSessionPooler(TX), false);
  assert.equal(isSessionPooler(DIRECT), false);
  assert.equal(dbConnectionSummary({ VERCEL_ENV: "production", DATABASE_URL: DIRECT }).dbVia, "direct");
  assert.equal(dbConnectionSummary({ DATABASE_URL: LOCAL }).dbVia, "direct");
});

test("lows 3: Production off the transaction pooler gets a warning that names the route and never the URL", () => {
  const missing = productionPoolerWarning({ VERCEL_ENV: "production", DATABASE_URL: SESSION });
  assert.deepEqual(missing, {
    message: "POSTGRES_PRISMA_URL is missing, so production reads DATABASE_URL through the session pooler",
    dbVia: "session pooler",
    dbPool: POOL_MAX,
  });
  assert.equal(
    productionPoolerWarning({ VERCEL_ENV: "production", DATABASE_URL: DIRECT })?.message,
    "POSTGRES_PRISMA_URL is missing, so production reads DATABASE_URL through a direct connection",
  );
  // Set, but to something other than the transaction pooler.
  assert.equal(
    productionPoolerWarning({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: SESSION })?.message,
    "POSTGRES_PRISMA_URL isn't the transaction pooler, so production reads through the session pooler",
  );
  assert.doesNotMatch(JSON.stringify(missing), /pw|pooler\.supabase\.com/);
  // On the pooler, off Production, or with no URL at all: nothing to say.
  assert.equal(productionPoolerWarning({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX_INTEGRATION }), null);
  assert.equal(productionPoolerWarning({ VERCEL_ENV: "preview", DATABASE_URL: SESSION }), null);
  assert.equal(productionPoolerWarning({ DATABASE_URL: SESSION }), null);
  assert.equal(productionPoolerWarning({ VERCEL_ENV: "production" }), null);
});

test("ADP-4: a unix socket or a server on the local network stays plain, as the engine's prefer left it", () => {
  for (const url of [
    "postgresql://u@/hg?host=/var/run/postgresql",
    "postgresql://u@/hg?host=%2Ftmp",
    "postgresql://u@192.168.1.20:5432/hg",
    "postgresql://u@10.0.0.5/hg",
    "postgresql://u@172.20.0.3/hg",
    "postgresql://u@169.254.10.1/hg",
    "postgresql://u@[fd12:3456::1]:5432/hg",
    "postgresql://u@[fe80::1]/hg",
    "postgresql://u@db:5432/hg",
    "postgresql://u@postgres.local/hg",
    "postgresql://u@host.docker.internal/hg",
    "postgresql://u@api.localhost/hg",
  ]) {
    assert.equal(runtimeDatabaseUrl({ DATABASE_URL: url }), url, url);
  }
  // Anything public still gets TLS.
  for (const url of [SESSION, "postgresql://u@db.abcd.supabase.co:5432/postgres", "postgresql://u@172.32.0.1/hg", "postgresql://u@8.8.8.8/hg", "postgresql://u@[2001:db8::1]/hg"]) {
    assert.ok(!isPrivateHost(url), url);
    assert.match(runtimeDatabaseUrl({ DATABASE_URL: url }) ?? "", /sslmode=require&uselibpqcompat=true$/, url);
  }
});

/**
 * A Postgres server with ssl off, as far as a client's opening goes: an SSLRequest gets 'N', a StartupMessage gets
 * AuthenticationOk and ReadyForQuery, so connect() resolves. `received` lists what each client opened with.
 */
async function plainTextServer(): Promise<{ port: number; received: string[]; close: () => Promise<void> }> {
  const SSL_REQUEST = 80877103;
  const PROTOCOL_3 = 196608;
  const received: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      // An opening message is an int32 length, then an int32 code; anything after it (Terminate) is ignored.
      while (pending.length >= 8) {
        const length = pending.readInt32BE(0);
        if (length < 8 || length > 10_000 || pending.length < length) return;
        const code = pending.readInt32BE(4);
        pending = pending.subarray(length);
        if (code === SSL_REQUEST) {
          received.push("SSLRequest");
          socket.write("N");
        } else if (code === PROTOCOL_3) {
          received.push("StartupMessage");
          socket.write(Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]));
        }
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    received,
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

test("lows 8: an explicit sslmode=prefer on a local or private host connects to a server with ssl off, as the engine's did", async () => {
  for (const [url, want] of [
    [`${LOCAL}?sslmode=prefer`, `${LOCAL}?sslmode=disable`],
    ["postgresql://u@/hg?host=/var/run/postgresql&sslmode=prefer", "postgresql://u@/hg?host=/var/run/postgresql&sslmode=disable"],
    ["postgresql://u@192.168.1.20:5432/hg?sslmode=prefer&application_name=x", "postgresql://u@192.168.1.20:5432/hg?sslmode=disable&application_name=x"],
    ["postgresql://u@db:5432/hg?sslmode=prefer", "postgresql://u@db:5432/hg?sslmode=disable"],
    [`${LOCAL}?schema=hg_test&sslmode=prefer&pgbouncer=true`, `${LOCAL}?sslmode=disable`],
  ]) {
    assert.equal(runtimeDatabaseUrl({ DATABASE_URL: url }), want, url);
    assert.equal(sslOf(want), false, want);
  }
  // Against a socket: plain text from the start, where the old rewrite (uselibpqcompat on prefer) sent an
  // SSLRequest and gave up on the server's 'N'.
  const server = await plainTextServer();
  try {
    const url = `postgresql://u@127.0.0.1:${server.port}/hg?sslmode=prefer`;
    const client = new Client({ connectionString: runtimeDatabaseUrl({ DATABASE_URL: url }) });
    await client.connect();
    await client.end();
    assert.deepEqual(server.received, ["StartupMessage"]);
    const forced = new Client({ connectionString: `${url}&uselibpqcompat=true` });
    await assert.rejects(forced.connect(), /does not support SSL/);
    assert.deepEqual(server.received, ["StartupMessage", "SSLRequest"]);
  } finally {
    await server.close();
  }
});

test("lows 8: sslmode=prefer on a public host keeps TLS, and a URL that names uselibpqcompat is left alone", () => {
  const url = `${SESSION}?sslmode=prefer`;
  const rt = runtimeDatabaseUrl({ DATABASE_URL: url }) ?? "";
  assert.equal(rt, `${url}&uselibpqcompat=true`);
  assert.deepEqual(sslOf(rt), { rejectUnauthorized: false });
  const own = `${LOCAL}?sslmode=prefer&uselibpqcompat=true`;
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: own }), own);
});

test("ADP-5: a schema= in the URL reaches the client and the session, and node-postgres never sees it", () => {
  const url = "postgresql://u@localhost:5432/hg?schema=hg_test";
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: url }), "postgresql://u@localhost:5432/hg");
  assert.equal(runtimeSchema({ DATABASE_URL: url }), "hg_test");
  assert.equal(runtimePoolConfig({ DATABASE_URL: url })?.options, "-c search_path=hg_test");
  // public, none, or a name that isn't a plain identifier: nothing changes.
  for (const plain of [`${SESSION}?schema=public`, SESSION, `${LOCAL}?schema=a%20b`, `${LOCAL}?schema=x;drop`]) {
    assert.equal(runtimeSchema({ DATABASE_URL: plain }), null, plain);
    assert.equal(runtimePoolConfig({ DATABASE_URL: plain })?.options, undefined, plain);
  }
  assert.doesNotMatch(runtimeDatabaseUrl({ DATABASE_URL: `${SESSION}?schema=public` }) ?? "", /schema=/);
});

test("maxWait: the client's default is the pool's connect timeout, the wait a transaction really gets", () => {
  // Measured on the scratch database: with every connection busy, a transaction asked to wait 500 ms waited 5.7 s,
  // because Prisma's maxWait doesn't reach the adapter's pool.connect; only POOL_CONNECT_TIMEOUT_MS bounds it.
  assert.equal(TRANSACTION_MAX_WAIT_MS, POOL_CONNECT_TIMEOUT_MS);
  assert.equal(runtimePoolConfig({ DATABASE_URL: LOCAL })?.connectionTimeoutMillis, TRANSACTION_MAX_WAIT_MS);
});
