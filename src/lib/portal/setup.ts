import "server-only";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import type { ContactDocKind } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { blobSizeRefusal, storedContactDocumentPath } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken } from "@/lib/attachments/paths";
import { readContactPatch } from "@/lib/contractors/contact-fields";
import { furthestStep, inSetup, setupChecklist, setupComplete, SETUP_STEPS, type SetupFacts, type SetupStep } from "@/lib/contractors/onboarding";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * The contractor's own setup (docs/specs/contractor-onboarding.md, section 3): each step's save, their W-9 and
 * insurance files, and Done. Portal-only: every function takes the signed-in contractor's contact id, and refuses
 * anyone staff added (they never set up, decision 5).
 *
 * Done is set the first time details, trades and a W-9 are all in; a later save never takes it back.
 */

export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

const NOT_YOURS = "There's nothing to set up on this account.";

export type SetupDoc = { id: string; filename: string; createdAt: Date; contentType: string | null };

export type SetupView = {
  contactId: string;
  fullName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  mailingAddress: string | null;
  tradeIds: string[];
  tradesNote: string | null;
  tenantFixes: boolean;
  setupStep: string | null;
  setupDoneAt: Date | null;
  noInsurance: boolean;
  w9: SetupDoc[];
  insurance: SetupDoc[];
};

const DOC_SELECT = { id: true, filename: true, createdAt: true, contentType: true, kind: true } as const;

/** Everything the steps show, or null for someone staff added. */
export async function readSetup(contactId: string): Promise<SetupView | null> {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      fullName: true,
      company: true,
      phone: true,
      email: true,
      mailingAddress: true,
      tradesNote: true,
      tenantFixes: true,
      setupStep: true,
      setupDoneAt: true,
      noInsurance: true,
      signupSource: true,
      archivedAt: true,
      tradeLinks: { select: { tradeId: true } },
      documents: { select: DOC_SELECT, orderBy: { createdAt: "desc" } },
    },
  });
  if (!c || c.signupSource === "STAFF" || c.archivedAt) return null;
  const docs = (kind: ContactDocKind): SetupDoc[] =>
    c.documents.filter((d) => d.kind === kind).map((d) => ({ id: d.id, filename: d.filename, createdAt: d.createdAt, contentType: d.contentType }));
  return {
    contactId: c.id,
    fullName: c.fullName,
    company: c.company,
    phone: c.phone,
    email: c.email,
    mailingAddress: c.mailingAddress,
    tradeIds: c.tradeLinks.map((l) => l.tradeId),
    tradesNote: c.tradesNote,
    tenantFixes: c.tenantFixes,
    setupStep: c.setupStep,
    setupDoneAt: c.setupDoneAt,
    noInsurance: c.noInsurance,
    w9: docs("W9"),
    insurance: docs("INSURANCE"),
  };
}

/** The shared trades, A to Z, for the Trades step's checklist. Contractors pick from it and never add to it (decision 7). */
export async function listTrades(): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.trade.findMany({ select: { id: true, name: true } });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/**
 * What the setup page and the account menu need to know about setup. Null for someone staff added (no menu item).
 * `card` is set while they're still in setup: the steps not done yet, and how many of the four are.
 */
export async function readSetupCard(contactId: string): Promise<{ card: { open: SetupStep[]; done: number } | null } | null> {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      fullName: true,
      phone: true,
      mailingAddress: true,
      tradesNote: true,
      setupStep: true,
      setupDoneAt: true,
      noInsurance: true,
      signupSource: true,
      archivedAt: true,
      _count: { select: { tradeLinks: true } },
      documents: { select: { kind: true } },
    },
  });
  if (!c || c.signupSource === "STAFF" || c.archivedAt) return null;
  if (!inSetup(c)) return { card: null };
  const checklist = setupChecklist({
    fullName: c.fullName,
    phone: c.phone,
    mailingAddress: c.mailingAddress,
    tradeCount: c._count.tradeLinks,
    tradesNote: c.tradesNote,
    setupStep: c.setupStep,
    w9Count: c.documents.filter((d) => d.kind === "W9").length,
    insuranceCount: c.documents.filter((d) => d.kind === "INSURANCE").length,
    noInsurance: c.noInsurance,
  });
  return { card: { open: SETUP_STEPS.filter((s) => !checklist[s]), done: SETUP_STEPS.filter((s) => checklist[s]).length } };
}

async function assertSetupContact(contactId: string): Promise<{ setupStep: string | null }> {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { signupSource: true, archivedAt: true, setupStep: true } });
  if (!c || c.signupSource === "STAFF" || c.archivedAt) throw new SetupError(NOT_YOURS);
  return c;
}

/** Saves the furthest step and sets Done the first time everything required is in. Returns whether they're done. */
async function advance(contactId: string, step: SetupStep): Promise<{ done: boolean }> {
  const c = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    select: {
      fullName: true,
      phone: true,
      mailingAddress: true,
      tradesNote: true,
      setupStep: true,
      setupDoneAt: true,
      noInsurance: true,
      _count: { select: { tradeLinks: true } },
      documents: { select: { kind: true } },
    },
  });
  const setupStep = furthestStep(c.setupStep, step);
  const facts: SetupFacts = {
    fullName: c.fullName,
    phone: c.phone,
    mailingAddress: c.mailingAddress,
    tradeCount: c._count.tradeLinks,
    tradesNote: c.tradesNote,
    setupStep,
    w9Count: c.documents.filter((d) => d.kind === "W9").length,
    insuranceCount: c.documents.filter((d) => d.kind === "INSURANCE").length,
    noInsurance: c.noInsurance,
  };
  const done = setupComplete(facts);
  await prisma.contact.update({
    where: { id: contactId },
    data: { setupStep, ...(done && !c.setupDoneAt ? { setupDoneAt: new Date() } : {}) },
  });
  return { done: done || !!c.setupDoneAt };
}

/** Step 2: name, company (optional), mobile and mailing address. */
export async function saveDetails(contactId: string, input: { fullName: string; company: string; phone: string; mailingAddress: string }): Promise<{ done: boolean }> {
  await assertSetupContact(contactId);
  const problems: Record<string, string> = {};
  const read = (field: "fullName" | "company" | "phone" | "mailingAddress", raw: string) => {
    const r = readContactPatch({ [field]: raw });
    if (!r.ok) problems[field] = r.message;
    return r.ok ? r.data : {};
  };
  const name = read("fullName", input.fullName);
  const company = input.company.trim() ? read("company", input.company) : { company: null };
  const phone = read("phone", input.phone);
  const address = read("mailingAddress", input.mailingAddress);
  if (!problems.fullName && !name.fullName) problems.fullName = "Enter your name.";
  if (!problems.phone && !phone.phone) problems.phone = "Enter your mobile number.";
  if (!problems.mailingAddress && !address.mailingAddress) problems.mailingAddress = "Enter your mailing address.";
  if (Object.keys(problems).length > 0) throw new FieldError(problems);
  await prisma.contact.update({ where: { id: contactId }, data: { ...name, ...company, ...phone, ...address } });
  return advance(contactId, "details");
}

/**
 * Step 3: trades from the shared list only (contractors can't add to it, decision 7), the "Anything we didn't list?"
 * line, and the tenant question. At least one trade or the line, and Yes or No.
 */
export async function saveTrades(contactId: string, input: { tradeIds: string[]; note: string; tenantFixes: boolean | null }): Promise<{ done: boolean }> {
  await assertSetupContact(contactId);
  const note = input.note.trim().replace(/\s+/g, " ").slice(0, 200) || null;
  const wanted = [...new Set(input.tradeIds)].slice(0, 50);
  const known = wanted.length > 0 ? await prisma.trade.findMany({ where: { id: { in: wanted } }, select: { id: true } }) : [];
  const problems: Record<string, string> = {};
  if (known.length === 0 && !note) problems.trades = "Pick at least one trade, or tell us what you do.";
  if (input.tenantFixes === null) problems.tenantFixes = "Pick Yes or No.";
  if (Object.keys(problems).length > 0) throw new FieldError(problems);
  const ids = known.map((t) => t.id);
  await prisma.$transaction(async (tx) => {
    await tx.contactTrade.deleteMany({ where: { contactId, tradeId: { notIn: ids } } });
    await tx.contactTrade.createMany({ data: ids.map((tradeId) => ({ contactId, tradeId })), skipDuplicates: true });
    await tx.contact.update({ where: { id: contactId }, data: { tradesNote: note, tenantFixes: input.tenantFixes === true } });
  });
  return advance(contactId, "trades");
}

/** Step 4: Next once a W-9 is on file. */
export async function saveW9Step(contactId: string): Promise<{ done: boolean }> {
  await assertSetupContact(contactId);
  const count = await prisma.contactDocument.count({ where: { contactId, kind: "W9" } });
  if (count === 0) throw new SetupError("Add your signed W-9 to go on.");
  return advance(contactId, "w9");
}

/** Step 5: a policy on file, or "I don't carry business insurance". */
export async function saveInsuranceStep(contactId: string, input: { noInsurance: boolean }): Promise<{ done: boolean }> {
  await assertSetupContact(contactId);
  const count = await prisma.contactDocument.count({ where: { contactId, kind: "INSURANCE" } });
  if (count === 0 && !input.noInsurance) throw new SetupError("Add your insurance, or tap I don't carry business insurance.");
  await prisma.contact.update({ where: { id: contactId }, data: { noInsurance: count === 0 && input.noInsurance } });
  return advance(contactId, "insurance");
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function blobAuth(): { token: string; storeId: string } {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new SetupError("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

async function discard(url: string | null, pathname: string, token: string): Promise<void> {
  try {
    await del(url ?? pathname, { token });
  } catch (err) {
    logError("portal:setup:discard", err, { pathname });
  }
}

/**
 * After the browser finished uploading straight to Blob: checks the blob itself (where it is, its type and size, as
 * property documents do) and records it on the contractor. Returns the new document's id.
 */
export async function recordContactDocument(contactId: string, docKind: "w9" | "insurance", input: { pathname: string; filename: string }): Promise<{ id: string }> {
  await assertSetupContact(contactId);
  const { token, storeId } = blobAuth();
  if (!storedContactDocumentPath(input.pathname, contactId, docKind)) throw new SetupError("That file isn't in your folder.");
  if (await prisma.contactDocument.findUnique({ where: { pathname: input.pathname }, select: { id: true } })) {
    throw new SetupError("That file is already added.");
  }
  let blob: HeadBlobResult;
  try {
    blob = await head(input.pathname, { token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new SetupError("That upload didn't finish. Try again.");
    throw err;
  }
  const refuse = async (message: string): Promise<never> => {
    await discard(blob.pathname === input.pathname ? blob.url : null, input.pathname, token);
    throw new SetupError(message);
  };
  if (blob.pathname !== input.pathname || !isPrivateStoreUrl(blob.url, storeId, input.pathname)) return refuse("That file isn't in our private storage.");
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  if (!kind || kind === "video") return refuse("Add a photo or a PDF.");
  const sizeRefusal = blobSizeRefusal(blob.size, UPLOAD_RULES[kind].maxBytes);
  if (sizeRefusal) return refuse(sizeRefusal);
  const row = await prisma.contactDocument.create({
    data: {
      contactId,
      kind: docKind === "w9" ? "W9" : "INSURANCE",
      url: blob.url,
      pathname: input.pathname,
      filename: filenameForType(input.filename, contentType).slice(0, 255) || "file",
      size: Math.max(0, Math.trunc(blob.size)),
      contentType,
      uploadedByContactId: contactId,
    },
    select: { id: true },
  });
  // A policy on file answers the insurance question.
  if (docKind === "insurance") await prisma.contact.update({ where: { id: contactId }, data: { noInsurance: false } });
  return row;
}

/** Removes one of the contractor's own files, before they've finished setup only (staff keep what was sent). */
export async function removeContactDocument(contactId: string, documentId: string): Promise<void> {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { signupSource: true, setupDoneAt: true } });
  if (!c || c.signupSource === "STAFF") throw new SetupError(NOT_YOURS);
  const d = await prisma.contactDocument.findUnique({ where: { id: documentId }, select: { contactId: true, url: true, pathname: true } });
  if (!d || d.contactId !== contactId) throw new SetupError("That file is gone.");
  if (c.setupDoneAt) throw new SetupError("Ask HG Capital to change a file you already sent.");
  await prisma.contactDocument.delete({ where: { id: documentId } });
  const { token } = blobAuth();
  await discard(d.url, d.pathname, token);
}
