import type { Instrumentation } from "next";

/**
 * Error alerts on the server (docs/specs/error-alerts.md). Next reads this file
 * only from src/, beside app/ (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/instrumentation.md). The work is in src/lib/report-server.ts,
 * loaded on the Node runtime only: the proxy runs on Node in Next 16, and nothing
 * here uses the edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startServerReporting } = await import("./lib/report-server");
  startServerReporting();
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./lib/report-server");
  await reportRequestError(...args);
};
