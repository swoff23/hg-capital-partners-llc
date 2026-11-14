import "server-only";
import { prisma } from "@/lib/db";
import { getCapexRules } from "@/lib/capex-rules";
import type { Ymd } from "@/lib/dates";
import { parseBuildingCapex, parseUnits, portfolioCapexForecast } from "@/lib/property-types";
import { isSold } from "@/lib/properties/figures";
import { liveRecord } from "@/lib/record-scope";
import { TRADE_LINKS, tradeLine } from "@/lib/contractors/trades";
import { baselaneItems, capexItem, keyDateItems, needsYouList, quickbooksItem, signupItems, type NeedsYouItem } from "./needs-you";

/**
 * Everything Home's Needs you list reads, in one place: each property's key
 * dates and CapEx inputs, the CapEx rules, and the QuickBooks connection.
 * The rules for what shows are in ./needs-you.
 */
export async function needsYou(today: Ymd, now: Date = new Date()): Promise<NeedsYouItem[]> {
  const [properties, rules, conn, signups, setups] = await Promise.all([
    // An archived property leaves Home (lib/archive.ts); its reminder tasks stay on Today.
    prisma.property.findMany({
      where: liveRecord,
      select: {
        id: true,
        address: true,
        status: true,
        units: true,
        buildingCapex: true,
        loanMaturityDate: true,
        insuranceRenewalDate: true,
        rentalRegistrationExpiry: true,
      },
    }),
    getCapexRules(),
    // The same row getConnection() (lib/quickbooks/client.ts) reads, without its tokens.
    prisma.quickbooksConnection.findFirst({
      orderBy: { createdAt: "desc" },
      select: { status: true, lastSuccessfulSyncAt: true, createdAt: true },
    }),
    // New people from the shared sign-up link wait for Keep or Archive (contractor onboarding, 4.5).
    prisma.contact.findMany({
      where: { needsReview: true, ...liveRecord },
      select: { id: true, fullName: true, phoneE164: true, email: true, createdAt: true, tradeLinks: TRADE_LINKS },
    }),
    // People who finished setup on their own and haven't been sent Baselane's link.
    prisma.contact.findMany({
      where: { setupDoneAt: { not: null }, baselaneSentAt: null, signupSource: { not: "STAFF" }, ...liveRecord },
      select: { id: true, fullName: true, setupDoneAt: true },
    }),
  ]);

  // Other contractors sharing a new sign-up's mobile or email, so the row can say so.
  const phones = signups.flatMap((s) => (s.phoneE164 ? [s.phoneE164] : []));
  const emails = signups.flatMap((s) => (s.email?.trim() ? [s.email.trim()] : []));
  const known =
    phones.length + emails.length === 0
      ? []
      : await prisma.contact.findMany({
          where: {
            ...liveRecord,
            OR: [
              ...(phones.length ? [{ phoneE164: { in: phones } }] : []),
              ...emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
            ],
          },
          select: { id: true, fullName: true, phoneE164: true, email: true },
          orderBy: { createdAt: "asc" },
        });

  // The forecast the Portfolio page's CapEx card draws (a sold building leaves it, charts D4), with
  // its year set by Buffalo's today (forecasts read the year off `now`, which on the UTC server
  // turns over at 7pm Eastern on Dec 31).
  const forecast = portfolioCapexForecast(
    properties
      .filter((p) => !isSold(p.status))
      .map((p) => ({
        id: p.id,
        address: p.address,
        units: parseUnits(p.units),
        building: parseBuildingCapex(p.buildingCapex),
      })),
    { years: 5, rules, now: new Date(Date.UTC(Number(today.slice(0, 4)), 6, 1, 12)) },
  );

  return needsYouList({
    keyDates: keyDateItems(properties, today),
    signups: signupItems(
      signups.map((s) => ({ id: s.id, fullName: s.fullName, phoneE164: s.phoneE164, email: s.email, trades: tradeLine(s.tradeLinks), createdAt: s.createdAt })),
      known,
    ),
    baselane: baselaneItems(
      setups.flatMap((s) => (s.setupDoneAt ? [{ id: s.id, fullName: s.fullName, setupDoneAt: s.setupDoneAt }] : [])),
      today,
    ),
    capex: capexItem(forecast),
    quickbooks: quickbooksItem(conn, now),
  });
}
