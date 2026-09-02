import { z } from "zod";

/**
 * The one place process.env is read. Parsed lazily on first access and
 * memoized, so importing a module never throws at build time (Vercel imports
 * route modules during `next build`, sometimes before the DB is attached).
 *
 * Rules:
 *  - "" is treated as unset (the .env.example files ship empty strings).
 *  - Malformed values (bad enum, bad month format) throw immediately: a typo
 *    like QBO_ENVIRONMENT="prod" must not silently run against the sandbox.
 *  - Missing values are allowed at parse time; the accessors below decide.
 *    `sessionSecret` throws in production and falls back to a dev-only string
 *    otherwise. `qbo` is all-or-nothing: null unless every key is present.
 *
 * No `server-only` import: scripts under scripts/ import src/lib/db.ts, which
 * imports this, outside of Next's runtime.
 */

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

const DEV_SESSION_SECRET = "dev-only-insecure-secret-change-in-prod";
const MIN_SESSION_SECRET_LENGTH = 32;

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  DATABASE_URL: z.string().optional(), // Prisma reports a missing URL itself, at first query
  SESSION_SECRET: z.string().optional(),
  HEALTH_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),
  QBO_REDIRECT_URI: z.string().url().optional(),
  QBO_TOKEN_SECRET: z.string().optional(),
  QBO_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  QBO_HISTORY_START: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be "YYYY-MM"')
    .optional(),
});

type Raw = z.infer<typeof schema>;

export interface QboEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenSecret: string;
  environment: "sandbox" | "production";
  /** First month of history to pull, "YYYY-MM". */
  historyStart: string;
}

export interface Env extends Raw {
  isProduction: boolean;
  /** Signs sessions and OAuth state. Throws in production if unset. */
  readonly sessionSecret: string;
  /** QuickBooks integration config, or null when any required key is missing. */
  readonly qbo: QboEnv | null;
}

let cached: Env | null = null;
let warnedDevSecret = false;

type EnvSource = Record<string, string | undefined>;

function stripEmpty(source: EnvSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) if (v != null && v !== "") out[k] = v;
  return out;
}

function build(source: EnvSource): Env {
  const parsed = schema.safeParse(stripEmpty(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new EnvError(`Invalid environment:\n${lines.join("\n")}`);
  }
  const raw = parsed.data;
  const isProduction = raw.NODE_ENV === "production";

  return {
    ...raw,
    isProduction,
    get sessionSecret(): string {
      if (raw.SESSION_SECRET) {
        if (isProduction && raw.SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
          console.warn(
            `[env] SESSION_SECRET is ${raw.SESSION_SECRET.length} chars; generate a ${MIN_SESSION_SECRET_LENGTH}+ char one (see .env.example).`,
          );
        }
        return raw.SESSION_SECRET;
      }
      if (isProduction) throw new EnvError("SESSION_SECRET is required in production");
      if (!warnedDevSecret) {
        warnedDevSecret = true;
        console.warn("[env] SESSION_SECRET is unset — using the insecure dev-only secret");
      }
      return DEV_SESSION_SECRET;
    },
    get qbo(): QboEnv | null {
      if (!raw.QBO_CLIENT_ID || !raw.QBO_CLIENT_SECRET || !raw.QBO_REDIRECT_URI || !raw.QBO_TOKEN_SECRET) {
        return null;
      }
      return {
        clientId: raw.QBO_CLIENT_ID,
        clientSecret: raw.QBO_CLIENT_SECRET,
        redirectUri: raw.QBO_REDIRECT_URI,
        tokenSecret: raw.QBO_TOKEN_SECRET,
        environment: raw.QBO_ENVIRONMENT,
        historyStart: raw.QBO_HISTORY_START ?? "2026-01",
      };
    },
  };
}

/** The validated environment. Parsed once; call `_resetEnvCache()` in tests after changing process.env. */
export function getEnv(): Env {
  return (cached ??= build(process.env));
}

/** Parse an arbitrary env object without touching the cache — for tests. */
export function parseEnv(source: EnvSource): Env {
  return build(source);
}

export function _resetEnvCache(): void {
  cached = null;
  warnedDevSecret = false;
}
