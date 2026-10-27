import { prisma } from "@/lib/db";
import { Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { buildDealLog } from "@/lib/deals/record-log";
import { DealLog } from "./deal-log";

/**
 * A deal's Activity: its notes and recorded changes, newest first, with the
 * note box on top (docs/specs/activity-comments.md 2.9, choice 3.3 A). A
 * server component that loads its own notes, so the deal page only mounts
 * it. The rows are shaped into the record log (lib/deals/record-log.ts:
 * authors, field changes folded by person, no-op lines left out) and drawn
 * by deal-log.tsx. A deleted note isn't loaded. The heading has no count: it
 * counted change lines and helped no decision (DEALS-058).
 */
export async function DealActivity({ dealId }: { dealId: string }) {
  const [user, rows] = await Promise.all([
    requireUser(),
    prisma.dealNote.findMany({
      where: { dealId, deletedAt: null },
      select: {
        id: true,
        source: true,
        body: true,
        noteDate: true,
        createdAt: true,
        authorUserId: true,
        editedAt: true,
        data: true,
        author: { select: { name: true, email: true } },
      },
    }),
  ]);
  const now = new Date();
  const entries = buildDealLog(
    rows.map((r) => ({
      id: r.id,
      source: r.source,
      body: r.body,
      noteDate: r.noteDate,
      createdAt: r.createdAt,
      authorUserId: r.authorUserId,
      authorName: r.author ? r.author.name || r.author.email.split("@")[0] : null,
      editedAt: r.editedAt,
      data: r.data,
    })),
  );

  return (
    <Section title="Activity">
      <DealLog
        dealId={dealId}
        entries={entries}
        viewerId={user.id}
        viewerName={user.name || user.email.split("@")[0]}
        now={now.toISOString()}
        today={todayYmdEastern(now)}
      />
    </Section>
  );
}
