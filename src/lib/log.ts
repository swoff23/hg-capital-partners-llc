/**
 * One-line JSON error logging. Vercel captures console.error per invocation,
 * so a single structured line per failure is what shows up in the Logs tab
 * and can be searched by `scope`. No dependency; safe to call from scripts.
 */
export function logError(scope: string, err: unknown, ctx: Record<string, unknown> = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = (e as { digest?: string }).digest;
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      name: e.name,
      message: e.message,
      ...(digest ? { digest } : {}),
      ...ctx,
      stack: e.stack?.split("\n").slice(1, 5).map((l) => l.trim()),
      at: new Date().toISOString(),
    }),
  );
}
