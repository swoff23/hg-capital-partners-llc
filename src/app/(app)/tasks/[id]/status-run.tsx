"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useRun } from "./use-run";

type Run = ReturnType<typeof useRun>;

/**
 * One status change at a time on the task page. The status menu, the Review
 * banner and Cancel share one run, so while one change saves the others
 * wait instead of sending a status that's about to be out of date (core
 * refuses a change whose `expected` status no longer matches).
 */
const StatusRun = createContext<Run | null>(null);

export function StatusRunProvider({ children }: { children: ReactNode }) {
  const run = useRun();
  return <StatusRun value={run}>{children}</StatusRun>;
}

export function useStatusRun(): Run {
  const ctx = useContext(StatusRun);
  if (!ctx) throw new Error("useStatusRun needs a StatusRunProvider above it.");
  return ctx;
}
