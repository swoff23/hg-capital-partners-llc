import type { QboCategory, QboLineTag, QboTreatment } from "@prisma/client";

/**
 * Per-line refinement of the account-level category/treatment. Pure; covered by
 * classify-line.test.ts against real rows from the data spike.
 *
 * The account isn't enough: owner P2P transfers and Section-8 vouchers both post
 * to "Rents". This adds the signals that only exist on the transaction line.
 */

export interface LineToClassify {
  category: QboCategory; // from seedCategory(account)
  treatment: QboTreatment; // from seedCategory(account)
  classification: string | null; // "Revenue" | "Expense" | ...
  amountCents: number; // natural signed
  name: string | null; // QBO "Name" (payee), verbatim
  memo: string | null; // QBO "Description", verbatim
  txnType: string;
}

export interface LineClassification {
  category: QboCategory;
  treatment: QboTreatment;
  lineTags: QboLineTag[];
}

const OWNER_NAME = /^(schwab bank|connor a?neil sw|connor swofford)$/i;
const OWNER_P2P = /\bp2p\b/i;
const OWNER_HINT = /(connor|aneil|swofford|schwab)/i;
const SUBSIDY =
  /(rental assis|\bhap\b|hap\s*p(mt|ymt)|\bhcv\b|section\s*8|\bpha\b|housing auth|erie county pha|buffalo municipa)/i;
const TRANSFER = /internal_transfer|transfer_out|transfer_in/i;

export function classifyLine(l: LineToClassify): LineClassification {
  const { category } = l;
  let { treatment } = l;
  const tags: QboLineTag[] = [];
  const hay = `${l.name ?? ""} ${l.memo ?? ""}`;

  if (category === "RENT") {
    const ownerFunded =
      OWNER_NAME.test((l.name ?? "").trim()) || (OWNER_P2P.test(hay) && OWNER_HINT.test(hay));
    if (ownerFunded) {
      tags.push("OWNER_FUNDED");
      treatment = "NON_OPERATING"; // out of NOI and out of "collected rent"
    } else if (SUBSIDY.test(hay)) {
      tags.push("SUBSIDY"); // stays OPERATING_INCOME — real tenant rent
    }
    if (TRANSFER.test(hay)) {
      tags.push("INTERNAL_TRANSFER");
      treatment = "EXCLUDED";
    }
  }

  // A negative expense line is a real refund/correction — kept, netted, flagged.
  if (l.classification === "Expense" && l.amountCents < 0) {
    tags.push("NEGATIVE_RECLASS");
  }

  return { category, treatment, lineTags: tags };
}
