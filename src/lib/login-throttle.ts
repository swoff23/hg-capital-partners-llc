/**
 * Failed-login throttle, keyed by lowercased email. After MAX_FAILURES
 * failures within WINDOW_MS the key is locked for LOCK_MS; a successful login
 * clears it.
 *
 * In-memory and therefore per-process: on Vercel each warm function instance
 * keeps its own counter, so a determined attacker spread across instances gets
 * a few times the limit, not unlimited attempts. That is still a large
 * improvement over no limit with scrypt on the hot path, and it costs no
 * schema. Move the counters to a table if the user count ever grows.
 *
 * Pure (clock injected) so it is unit-testable.
 */

export interface ThrottleState {
  failures: number[]; // timestamps of failures inside the window
  lockedUntil: number | null;
}

export interface ThrottleOptions {
  maxFailures?: number;
  windowMs?: number;
  lockMs?: number;
}

export class LoginThrottle {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockMs: number;
  private readonly state = new Map<string, ThrottleState>();

  constructor(opts: ThrottleOptions = {}) {
    this.maxFailures = opts.maxFailures ?? 5;
    this.windowMs = opts.windowMs ?? 15 * 60_000;
    this.lockMs = opts.lockMs ?? 15 * 60_000;
  }

  private key(k: string): string {
    return k.trim().toLowerCase();
  }

  /** Is this key currently locked? Returns the remaining lock time in ms when so. */
  check(rawKey: string, now: number = Date.now()): { locked: false } | { locked: true; retryAfterMs: number } {
    const s = this.state.get(this.key(rawKey));
    if (!s?.lockedUntil) return { locked: false };
    if (s.lockedUntil <= now) {
      this.state.delete(this.key(rawKey));
      return { locked: false };
    }
    return { locked: true, retryAfterMs: s.lockedUntil - now };
  }

  /** Record a failed attempt; returns true when this failure triggered a lock. */
  recordFailure(rawKey: string, now: number = Date.now()): boolean {
    const key = this.key(rawKey);
    const s = this.state.get(key) ?? { failures: [], lockedUntil: null };
    s.failures = s.failures.filter((t) => t > now - this.windowMs);
    s.failures.push(now);
    if (s.failures.length >= this.maxFailures) {
      s.lockedUntil = now + this.lockMs;
      s.failures = [];
      this.state.set(key, s);
      return true;
    }
    this.state.set(key, s);
    return false;
  }

  /** A successful login clears any history for the key. */
  reset(rawKey: string): void {
    this.state.delete(this.key(rawKey));
  }

  /** Drop expired entries — cheap housekeeping, called opportunistically. */
  prune(now: number = Date.now()): void {
    for (const [k, s] of this.state) {
      const live = s.failures.some((t) => t > now - this.windowMs);
      const locked = !!s.lockedUntil && s.lockedUntil > now;
      if (!live && !locked) this.state.delete(k);
    }
  }
}

/** Process-wide instance used by the login action. */
export const loginThrottle = new LoginThrottle();
