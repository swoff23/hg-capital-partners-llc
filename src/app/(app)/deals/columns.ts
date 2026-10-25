/*
 * The deals table's columns. A plain module, not a client one, so the server
 * page (the header cells) reads the same values as the client rows and the
 * colgroup.
 */

/**
 * Default widths, in px. They add up to 1124, which fits the 1152px column a
 * 1280 laptop gives the list beside the collapsed sidebar with 11px to spare
 * for an always-on scrollbar (Windows, or macOS set to show scroll bars).
 * Status fits "4 - To Schedule" in its picker, the prices fit "$1,250,000"
 * and Updated fits "Sep 30, 2025", with a mouse and at the 16px touch size:
 * a field cell's 3px inset, the field's 1px edge and its 8px padding leave a
 * 120px price column 96px of text room, and "$1,250,000" needs 84.
 */
export const DEFAULT_COLUMN_WIDTHS = {
  address: 208,
  status: 192,
  units: 72,
  theirPrice: 120,
  ourPrice: 120,
  latestNote: 144,
  nextAction: 168,
  updated: 100,
} as const;

export type ColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

/**
 * Where each column drops, by the list's own width (the @container around
 * the table, so the pinned sidebar counts too). At the default widths the
 * table always fits its column, so it never pans sideways and its header
 * sticks: all eight from 1124px (their sum), then Latest note goes, Updated
 * below 980, Next action below 880, Units and Our price below 712 (a 768
 * tablet keeps those five), and below 520 Status and Their price move into
 * the row's subline and the row turns to two lines (deal-row.tsx). A column's
 * col, header and cells all take its class. A table dragged wider than its
 * column still scrolls in its own box.
 */
export const COLUMN_DROP: Record<ColumnKey, string> = {
  address: "",
  status: "@max-[32.5rem]:hidden",
  units: "@max-[44.5rem]:hidden",
  theirPrice: "@max-[32.5rem]:hidden",
  ourPrice: "@max-[44.5rem]:hidden",
  latestNote: "@max-[70.25rem]:hidden",
  nextAction: "@max-[55rem]:hidden",
  updated: "@max-[61.25rem]:hidden",
};
