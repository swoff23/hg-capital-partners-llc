"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import { createLease } from "@/lib/tenants/service";

const text = (max: number) => z.string().max(max);

const newLeaseSchema = z
  .object({
    propertyId: z.string().min(1, "Choose a property."),
    unitId: z.string().nullable(),
    tenants: z.array(z.object({ fullName: text(500), phone: text(200), email: text(600) }).strict()).max(50),
    movesIn: text(40),
    deposit: text(40),
    startsOn: text(40),
    endsOn: text(40),
    rent: text(40),
    subsidy: text(40),
    subsidyFrom: text(500),
    subsidyContact: text(500),
    subsidyEmail: text(600),
  })
  .strict();

/**
 * Save a new lease from the New lease page: the household, when they move in,
 * the first term and the money. The service checks every line and refuses with
 * the field it's about (`unitId`, `movesIn`, `tenants.0.fullName`, `rent`), and
 * nothing is saved until all of it reads.
 */
export async function createNewLease(input: z.input<typeof newLeaseSchema>): Promise<ActionResult<{ id: string }>> {
  return withResult("createNewLease", async () => {
    const user = await requireUser();
    const v = newLeaseSchema.parse(input);
    return createLease(
      {
        propertyId: v.propertyId,
        unitId: v.unitId,
        tenants: v.tenants.map((t) => ({ new: { fullName: t.fullName, phone: t.phone, email: t.email } })),
        primary: 0,
        movesIn: v.movesIn,
        deposit: v.deposit,
        term: { startsOn: v.startsOn, endsOn: v.endsOn, rent: v.rent, subsidy: v.subsidy,
          subsidyFrom: v.subsidyFrom,
          subsidyContact: v.subsidyContact,
          subsidyEmail: v.subsidyEmail,
        },
      },
      { id: user.id },
    );
  });
}
