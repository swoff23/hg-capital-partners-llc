/**
 * When a Monitor or Replace cost falls due, while that's still ahead: "in
 * 2032", after the cost in the Building CapEx and equipment tables. Null for
 * a year already past, which the row's Replace status already says: a 1990
 * roof read "$12,000 in 2010", like money spent in 2010. Pure; see
 * capex.test.ts.
 */
export function dueIn(due: number | null | undefined, thisYear: number): string | null {
  return due != null && due >= thisYear ? `in ${due}` : null;
}
