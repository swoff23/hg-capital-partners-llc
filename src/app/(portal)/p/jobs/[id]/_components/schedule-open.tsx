"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

type OpenState = [boolean, (open: boolean) => void];

/**
 * Whether the scheduled-day picker is open, shared by the job card's Schedule
 * button (job-date.tsx) and the bar's Schedule (job-actions.tsx), so both
 * open the one picker (Connor, Nov 22: the bar asks for a day until one is
 * set). Outside the provider each picker keeps its own state.
 */
const ScheduleOpen = createContext<OpenState | null>(null);

export function ScheduleOpenProvider({ children }: { children: ReactNode }) {
  const state = useState(false);
  return <ScheduleOpen.Provider value={state}>{children}</ScheduleOpen.Provider>;
}

export function useScheduleOpen(): OpenState {
  const shared = useContext(ScheduleOpen);
  const own = useState(false);
  return shared ?? own;
}
