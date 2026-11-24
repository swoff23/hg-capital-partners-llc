import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveResidentLink } from "@/lib/residents/links";
import { residentHome } from "@/lib/residents/emails";
import { lastPetsAnswer } from "@/lib/residents/requests";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Report a problem" };

/** Report a problem (docs/specs/maintenance-requests.md, section 3.2): one screen. */
export default async function NewRequestPage({ params }: PageProps<"/r/[token]/new">) {
  const { token } = await params;
  const link = await resolveResidentLink(token);
  if (!link || link.state !== "live") notFound();
  const { ctx } = link;
  return (
    <RequestForm
      token={token}
      linkId={ctx.linkId}
      firstName={ctx.firstName}
      home={residentHome(ctx.address, ctx.unitLabel)}
      lastPets={await lastPetsAnswer(ctx)}
    />
  );
}
