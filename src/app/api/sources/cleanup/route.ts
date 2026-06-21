import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/sources/cleanup?locationId=xxx
 *
 * Bulk-removes every calendar source for this location whose most recent
 * import job FAILED with 0 events created. These never produced anything
 * in GHL (creation crashed/rejected before any slot was written), so there's
 * nothing to clean up there — just stale DB clutter from repeated retries.
 * Sources with at least one successful import are never touched.
 */
export async function DELETE(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  const sources = await prisma.calendarSource.findMany({
    where: { location: { locationId } },
    include: { importJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const idsToDelete = sources
    .filter((s: typeof sources[number]) => {
      const lastJob = s.importJobs[0];
      return lastJob && lastJob.status === "FAILED" && lastJob.eventsCreated === 0;
    })
    .map((s: typeof sources[number]) => s.id);

  if (idsToDelete.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  await prisma.calendarSource.deleteMany({ where: { id: { in: idsToDelete } } });

  return NextResponse.json({ ok: true, deleted: idsToDelete.length });
}