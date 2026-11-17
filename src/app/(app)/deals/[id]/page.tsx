import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { LIST_COOKIES, cleanQuery, listHref } from "@/lib/list-memory";
import { recordMetadata } from "@/lib/record-metadata";
import DealsPage from "../(list)/page";
import { DealRecordSheet, loadDeal } from "./deal-record";

/** The tab names the deal (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  return recordMetadata("deal", (await params).id);
}

/** A remembered query as the list page reads its searchParams: a key given twice is a list. */
function asSearchParams(query: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const had = out[k];
    out[k] = had === undefined ? v : Array.isArray(had) ? [...had, v] : [had, v];
  }
  return out;
}

/**
 * A deal on a full load (a reload, a pasted or copied link, ⌘-click on a
 * row): there's no deal page, so it's the deals list as this person left it
 * (its remembered query) with the deal's sheet open over it. Closing the
 * sheet replaces the URL with that list. A click inside the app opens the
 * same sheet through the `@modal` slot instead.
 */
export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  if (!(await loadDeal(id))) notFound();
  const query = cleanQuery((await cookies()).get(LIST_COOKIES.deals)?.value);

  return (
    <>
      <DealsPage params={Promise.resolve({})} searchParams={Promise.resolve(asSearchParams(query))} />
      <DealRecordSheet id={id} closeHref={listHref("deals", query)} />
    </>
  );
}

export const dynamic = "force-dynamic";
