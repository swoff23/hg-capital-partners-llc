import "server-only";
import { prisma } from "@/lib/db";
import { getCapexRules } from "@/lib/capex-rules";
import type { Ymd } from "@/lib/dates";
import { parseBuildingCapex, parseUnits, portfolioCapexForecast } from "@/lib/property-types";
import { capexItem, keyDateItems, needsYouList, quickbooksItem, type NeedsYouItem } from "./needs-you";

/**
 * Everything Home's Needs you list reads, in one place: each property's key
 * dates and CapEx inputs, the CapEx rules, and the QuickBooks connection.
 * The rules for what shows are in ./needs-you.
 */
export async function needsYou(today: Ymd, now: Date = new Date()): Promise<NeedsYouItem[]> {
  const [properties, rules, conn] = await Promise.all([
    prisma.property.findMany({
      select: {
        id: true,
        address: true,
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
  ]);

  // The forecast the Portfolio page's CapEx card draws, with its year set by
  // Buffalo's today (forecasts read the year off `now`, which on the UTC
  // server turns over at 7pm Eastern on Dec 31).
  const forecast = portfolioCapexForecast(
    properties.map((p) => ({
      id: p.id,
      address: p.address,
      units: parseUnits(p.units),
      building: parseBuildingCapex(p.buildingCapex),
    })),
    { years: 5, rules, now: new Date(Date.UTC(Number(today.slice(0, 4)), 6, 1, 12)) },
  );

  return needsYouList({
    keyDates: keyDateItems(properties, today),
    capex: capexItem(forecast),
    quickbooks: quickbooksItem(conn, now),
  });
}
