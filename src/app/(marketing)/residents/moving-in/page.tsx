import Link from "next/link";
import type { Metadata } from "next";
import { publicContainer, publicTextLinkClass, publicType } from "@/components/public/ui";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { getMoveInFormSchema } from "@/lib/move-in-form";
import { rentableUnitLabels } from "@/lib/property-types";
import { cn } from "@/lib/utils";
import { MoveInForm } from "./move-in-form";

export const metadata: Metadata = {
  title: { absolute: `Moving In | ${BRAND.company}` },
  description: "Move-in checklist and the condition report for HG Capital residents.",
};

export const dynamic = "force-dynamic";

const CHECKLIST = [
  {
    timing: "Due before move-in",
    title: "Security deposit",
    body: (
      <>
        Baselane will email you an invite to pay. Your welcome email has the exact amount and
        other payment options.
      </>
    ),
  },
  {
    timing: "Do this ASAP",
    title: "Gas & electric",
    body: (
      <>
        Call{" "}
        <a href="https://www.nationalgridus.com/" target="_blank" rel="noopener noreferrer" className={publicTextLinkClass}>
          National Grid
        </a>{" "}
        and{" "}
        <a href="https://www.nationalfuel.com/" target="_blank" rel="noopener noreferrer" className={publicTextLinkClass}>
          National Fuel
        </a>{" "}
        to open an account in your name, starting on your lease date. It&rsquo;s required before
        move-in, so text us once it&rsquo;s done.
      </>
    ),
  },
  {
    timing: "Before move-in",
    title: "Renter's insurance",
    body: (
      <>
        Required. Covers your belongings and adds liability protection. Many tenants use{" "}
        <a href="https://www.lemonade.com/" target="_blank" rel="noopener noreferrer" className={publicTextLinkClass}>
          Lemonade
        </a>
        , but any provider works. Email us a copy of your policy.
      </>
    ),
  },
  {
    timing: "Day of move-in",
    title: "Key handover",
    body: <>We&rsquo;ll drop off your keys the morning of move-in, once utilities are confirmed set up.</>,
  },
  {
    timing: "Within 2 days after move-in",
    title: "Move-in report",
    body: <>Complete the inspection below.</>,
  },
  {
    timing: "Ongoing",
    title: "Maintenance & rent",
    body: (
      <>
        We&rsquo;ll set up a group text for anything that comes up. Rent is paid through
        Baselane, via a separate email invite. We recommend autopay.
      </>
    ),
  },
];

export default async function MovingInPage() {
  const [schema, rows] = await Promise.all([
    getMoveInFormSchema(),
    prisma.property.findMany({ select: { id: true, address: true, units: true }, orderBy: { address: "asc" } }),
  ]);
  // Only unit labels reach this public page; lockbox codes and utility accounts never leave the server.
  const properties = rows.map((p) => ({ id: p.id, address: p.address, units: rentableUnitLabels(p.units) }));

  return (
    <main className={cn(publicContainer, "py-10 sm:py-12")}>
      <div className="max-w-2xl">
        <h1 className={cn(publicType.heading, "text-fg-1")}>Moving in</h1>

        <ul className="mt-8 border-t border-line">
          {CHECKLIST.map((c) => (
            <li key={c.title} className="border-b border-line py-4">
              <p className={cn(publicType.meta, "text-fg-3")}>{c.timing}</p>
              <h2 className={cn(publicType.title, "mt-1 text-fg-1")}>{c.title}</h2>
              <p className={cn(publicType.meta, "mt-1 text-pretty text-fg-3")}>{c.body}</p>
            </li>
          ))}
        </ul>

        <section aria-labelledby="move-in-report" className="mt-12">
          <p className={cn(publicType.meta, "text-fg-3")}>Move-in report</p>
          <h2 id="move-in-report" className={cn(publicType.heading, "mt-1 text-fg-1")}>
            Tell us how everything looks.
          </h2>
          <p className={cn(publicType.meta, "mt-2 text-pretty text-fg-3")}>
            Complete this within 2 days of move-in. Not completing it means there are no issues with the home.
          </p>

          <div className="mt-8">
            <MoveInForm schema={schema} properties={properties} />
          </div>
        </section>

        <p className={cn(publicType.meta, "mt-10 text-fg-3")}>
          Already a resident with a different question?{" "}
          <Link href="/residents" className={publicTextLinkClass}>
            Back to Residents
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
