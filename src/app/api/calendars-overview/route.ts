import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/calendars-overview?locationId=xxx
 *
 * A single GHL calendar can be the target of multiple CalendarSources (e.g.
 * a "World Cup" import and a "Holiday events" import both pointed at the
 * same calendar). This groups every source for the location by its
 * ghlCalendarId so the "View calendars" page can show one card per actual
 * GHL calendar, with the combined source/event counts.
 */
export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  const sources = await prisma.calendarSource.findMany({
    where: { location: { locationId } },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { importedEvents: true } },
      importJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  type SourceRow = typeof sources[number];
  type CalendarGroup = {
    ghlCalendarId: string;
    sources: SourceRow[];
    eventCount: number;
    lastSyncAt: Date | null;
  };

  const byCalendar = new Map<string, CalendarGroup>();

  for (const source of sources) {
    const entry: CalendarGroup = byCalendar.get(source.ghlCalendarId) ?? {
      ghlCalendarId: source.ghlCalendarId,
      sources: [],
      eventCount: 0,
      lastSyncAt: null,
    };
    entry.sources.push(source);
    entry.eventCount += source._count.importedEvents;
    if (source.lastSyncAt && (!entry.lastSyncAt || source.lastSyncAt > entry.lastSyncAt)) {
      entry.lastSyncAt = source.lastSyncAt;
    }
    byCalendar.set(source.ghlCalendarId, entry);
  }

  const calendars = Array.from(byCalendar.values()).sort(
    (a, b) => (b.lastSyncAt?.getTime() ?? 0) - (a.lastSyncAt?.getTime() ?? 0)
  );

  return NextResponse.json({ calendars });
}
