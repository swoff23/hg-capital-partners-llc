/*
 * Moved to components/rail.tsx (forms 2.8), since deals, tasks and
 * contractors use the facts rail too. This re-export keeps the importers that
 * other packages own working (property-tasks.tsx, edit-documents.tsx); the
 * integration clean-up deletes the file once they import from the new place.
 */
export { Count, RailFact, RailList, RailVerb, SaveError } from "@/components/rail";
