/**
 * The entities already on properties, as the suggestions an Entity field
 * offers (New property, and Details on a property's page): trimmed, each one
 * once, in the order they come.
 */
export function uniqueEntities(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim() ?? "").filter(Boolean))];
}
