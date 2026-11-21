/**
 * Where a search hit on a hidden field lands on the property page
 * (docs/specs/search-deeper-fields.md 5): `?find=<target>` names the line,
 * never its value. A target is `<unitId>.equipment.<n>` (the item's place in
 * the unit's list), `<unitId>.utilities.<field>`, or a property field
 * (`loanNumber`, `lender`, `loanServicer`, `insurancePolicyNo`,
 * `insuranceCarrier`). The line carries `id={findElementId(target)}`.
 * Kept apart from the search rules so the property page's bundle stays small.
 */

export const FIND_PARAM = "find";

/** The element id a find target lands on. */
export const findElementId = (target: string): string => `find-${target}`;

/** A unit's equipment item, by its place in the unit's list. */
export const equipmentTarget = (unitId: string, index: number): string => `${unitId}.equipment.${index}`;

/** A unit's utility field. */
export const utilityTarget = (unitId: string, field: string): string => `${unitId}.utilities.${field}`;

/** Whether a target is a property field in a facts rail (it may sit in a fold), not a line inside a unit. */
export const isFieldTarget = (target: string): boolean => !target.includes(".");

/** A property page that lands on `target`. */
export const propertyFindHref = (propertyId: string, target: string): string =>
  `/properties/${propertyId}?${new URLSearchParams({ [FIND_PARAM]: target })}`;
