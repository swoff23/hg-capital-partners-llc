import { ConflictError } from "@/lib/action-result";
import { isDealStatus } from "@/lib/config";
import { amountToDecimal } from "@/lib/money";
import { fieldText, rowConflict, staleFields, type LastEditor } from "@/lib/properties/edits";

/**
 * What a deal edit writes, and the check that a save from a stale page is
 * refused (forms 2.12), kept pure so deals/service.test.ts can run it
 * without a database. The deal service (service.ts) reads the row, asks
 * `staleDealFields`, writes `dealPatchData`, and logs the change.
 *
 * The editors send, for each field they changed, the text they loaded for
 * it (`expected`), the way the property editors do (properties/edits.ts). A
 * field whose stored value has moved off that was saved by someone else
 * meanwhile, and then nothing is written. The list's quick edits send no
 * `expected` and keep their last-write-wins: a row is one stage pick.
 */

/** Whitelisted inline-editable fields. A key that is present is written; null / "" clears. */
export interface DealPatch {
  address?: string;
  status?: string;
  priority?: string | null;
  passReason?: string | null;
  theirPriceRaw?: string | null;
  ourPriceRaw?: string | null;
  units?: number | null;
  nextAction?: string | null;
  sourceUrl?: string | null;
}

/** The fields a patch can carry, in the rail's order. */
export const DEAL_PATCH_FIELDS = [
  "address",
  "status",
  "priority",
  "passReason",
  "theirPriceRaw",
  "ourPriceRaw",
  "units",
  "nextAction",
  "sourceUrl",
] as const satisfies readonly (keyof DealPatch)[];

/** The columns a patch writes. Prices keep the typed text and a parsed Decimal; an unknown stage is ignored. */
export function dealPatchData(patch: DealPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.address?.trim()) data.address = patch.address.trim();
  if (patch.status && isDealStatus(patch.status)) data.status = patch.status;
  if ("priority" in patch) data.priority = patch.priority || null;
  if ("passReason" in patch) data.passReason = patch.passReason || null;
  if ("units" in patch) data.units = patch.units ?? null;
  if ("sourceUrl" in patch) data.sourceUrl = patch.sourceUrl?.trim() || null;
  if ("theirPriceRaw" in patch) {
    data.theirPriceRaw = patch.theirPriceRaw || null;
    data.theirPrice = amountToDecimal(patch.theirPriceRaw);
  }
  if ("ourPriceRaw" in patch) {
    data.ourPriceRaw = patch.ourPriceRaw || null;
    data.ourPrice = amountToDecimal(patch.ourPriceRaw);
  }
  if ("nextAction" in patch) data.nextAction = patch.nextAction || null;
  return data;
}

/** What the patch writes to each field it carries, as the loaded text compares it. */
function changeTexts(patch: DealPatch, data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of DEAL_PATCH_FIELDS) if (k in data) out[k] = fieldText(data[k]);
  return out;
}

/**
 * The fields of this patch that someone else changed since the editor loaded
 * them: the stored value is neither what the editor loaded nor what it's
 * about to write. Empty when the patch carries no `expected`.
 */
export function staleDealFields(
  stored: Record<string, unknown>,
  patch: DealPatch,
  expected: Record<string, string> = {},
): string[] {
  const data = dealPatchData(patch);
  const changes = changeTexts(patch, data);
  const guarded = Object.keys(expected).filter((k) => k in changes);
  if (guarded.length === 0) return [];
  return staleFields(stored, {
    changes: Object.fromEntries(guarded.map((k) => [k, changes[k]])),
    expected: Object.fromEntries(guarded.map((k) => [k, expected[k]])),
  });
}

/** The fields a patch guards: the ones it writes and the editor sent a loaded value for. */
export function guardedDealFields(patch: DealPatch, expected: Record<string, string> = {}): string[] {
  const changes = changeTexts(patch, dealPatchData(patch));
  return Object.keys(expected).filter((k) => k in changes);
}

/**
 * The refusal for a stale deal save: who saved last when the row says, when,
 * and what each field holds now. When the last save was the same person's
 * (another tab of theirs), it names no one ("This changed to $111 at 8:31
 * AM", "Keep current"), where it read "Connor set this to $111" and "Keep
 * Connor's" to Connor.
 */
export function dealConflict(
  row: Record<string, unknown> & { updatedAt: Date; updatedByUser?: LastEditor },
  fields: string[],
  actorId?: string,
) {
  const yours = actorId !== undefined && row.updatedByUserId === actorId;
  return rowConflict(yours ? { ...row, updatedByUser: null } : row, fields, { values: true });
}

/**
 * Runs a deal write and, when a newer save refuses it (`ConflictError`),
 * runs `refresh` before the refusal goes back (forms 2.12). The service
 * passes `revalidateDeal`, so the action's answer carries the page as stored
 * and the stage menu and every field show the current value. The stale page
 * used to keep the stage it loaded until a reload. Tasks do the same
 * (tasks/service.ts setTaskStatus).
 */
export async function refreshOnConflict<T>(write: () => Promise<T>, refresh: () => void): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof ConflictError) refresh();
    throw err;
  }
}
