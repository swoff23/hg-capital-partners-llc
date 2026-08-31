import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getMoveInFormSchema } from "@/lib/move-in-form";
import { MoveInForm } from "./move-in-form";

export const metadata: Metadata = {
  title: "Moving In — HG Capital Partners",
  description: "Move-in checklist and the condition report for HG Capital residents.",
};

export const dynamic = "force-dynamic";

const CHECKLIST = [
  {
    timing: "Due before move-in",
    title: "Security deposit",
    body: (
      <>
        Pay via Baselane — you&rsquo;ll receive an invite. See your welcome email for the
        exact amount and other payment options.
      </>
    ),
  },
  {
    timing: "Do this ASAP",
    title: "Gas & electric",
    body: (
      <>
        Call{" "}
        <a href="https://www.nationalgridus.com/" target="_blank" rel="noopener noreferrer" className="text-[#c8a765] hover:underline">
          National Grid
        </a>{" "}
        and{" "}
        <a href="https://www.nationalfuel.com/" target="_blank" rel="noopener noreferrer" className="text-[#c8a765] hover:underline">
          National Fuel
        </a>{" "}
        to open an account in your name, starting on your lease date. Text us once it&rsquo;s
        done — this is required before move-in.
      </>
    ),
  },
  {
    timing: "Before move-in",
    title: "Renter's insurance",
    body: (
      <>
        Required. Covers your belongings and adds liability protection. Many tenants use{" "}
        <a href="https://www.lemonade.com/" target="_blank" rel="noopener noreferrer" className="text-[#c8a765] hover:underline">
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
        Baselane, via a separate email invite — autopay is recommended.
      </>
    ),
  },
];

export default async function MovingInPage() {
  const [schema, properties] = await Promise.all([
    getMoveInFormSchema(),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
  ]);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:px-10">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Residents</p>
          <div className="my-7 h-px w-14 bg-[#c8a765]/40 mx-auto" />
          <h1 className="text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
            Moving in
          </h1>
        </div>

        <ul className="mt-10 space-y-5">
          {CHECKLIST.map((c) => (
            <li key={c.title} className="rounded-2xl border border-white/15 p-5">
              <p className="text-[0.625rem] font-medium uppercase tracking-wider text-[#c8a765]">{c.timing}</p>
              <h2 className="mt-1.5 text-sm font-medium text-[#e8eaee]">{c.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#767d8a]">{c.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-14 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Move-in report</p>
          <div className="my-7 h-px w-14 bg-[#c8a765]/40 mx-auto" />
          <h2 className="text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
            Tell us how everything looks.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#767d8a]">
            Complete this within 2 days of move-in. Not completing it means there are no
            issues with the home.
          </p>
        </div>

        <div className="mt-8">
          <MoveInForm schema={schema} properties={properties} />
        </div>

        <p className="mt-10 text-center text-sm leading-relaxed text-[#767d8a]">
          Already a resident with a different question?{" "}
          <Link href="/residents" className="text-[#c8a765] hover:underline">
            Back to Residents
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
