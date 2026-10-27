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
 *    `sessionSecret` and `appUrl` throw in production and fall back to a
 *    dev-only value otherwise. `qbo` and `email` are all-or-nothing: null
 *    unless every key is present.
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
const DEV_APP_URL = "http://localhost:3000";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  DATABASE_URL: z.string().optional(), // Prisma reports a missing URL itself, at first query
  // The Supabase integration's transaction pooler URL; production's runtime reads through it (src/lib/db-url.ts).
  POSTGRES_PRISMA_URL: z.string().optional(),
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

  // Asana personal access token, read only by scripts/asana/* (the one-time
  // export and import). Never needed by the app runtime.
  ASANA_TOKEN: z.string().optional(),

  // Contractor portal (docs/asana-migration-plan.md §5.1). Off unless "1" or
  // "true": contractor sign-in, /p pages and password reset all 404 while off.
  PORTAL_ENABLED: z
    .string()
    .regex(/^(1|0|true|false)$/i, 'must be "1", "0", "true" or "false"')
    .optional(),
  // Resend (src/lib/email/send.ts). Both unset locally: emails print to the console.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(), // "HG Capital <jobs@mail.example.com>"
  // Where replies go, e.g. "office@hgcapitalpartners.com". Unset: replies go to EMAIL_FROM.
  EMAIL_REPLY_TO: z.email("must be an email address").optional(),
  // Origin for links in emails, e.g. "https://hgcapitalpartners.com".
  APP_URL: z.string().url().optional(),
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

export interface EmailEnv {
  apiKey: string;
  from: string;
  /** EMAIL_REPLY_TO, or null to send no Reply-To. */
  replyTo: string | null;
}

export interface Env extends Raw {
  isProduction: boolean;
  /** Signs sessions and OAuth state. Throws in production if unset. */
  readonly sessionSecret: string;
  /** QuickBooks integration config, or null when any required key is missing. */
  readonly qbo: QboEnv | null;
  /** PORTAL_ENABLED is "1" or "true". */
  readonly portalEnabled: boolean;
  /** Resend config, or null unless both RESEND_API_KEY and EMAIL_FROM are set. EMAIL_REPLY_TO is optional. */
  readonly email: EmailEnv | null;
  /** Origin for links in emails, no trailing slash. Throws in production if unset. */
  readonly appUrl: string;
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
        console.warn("[env] SESSION_SECRET is unset, so sessions use the insecure dev-only secret");
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
    get portalEnabled(): boolean {
      return /^(1|true)$/i.test(raw.PORTAL_ENABLED ?? "");
    },
    get email(): EmailEnv | null {
      if (!raw.RESEND_API_KEY || !raw.EMAIL_FROM) return null;
      return { apiKey: raw.RESEND_API_KEY, from: raw.EMAIL_FROM, replyTo: raw.EMAIL_REPLY_TO ?? null };
    },
    get appUrl(): string {
      if (raw.APP_URL) return raw.APP_URL.replace(/\/+$/, "");
      if (isProduction) throw new EnvError("APP_URL is required in production (links in emails)");
      return DEV_APP_URL;
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
