import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/calendars-overview/[ghlCalendarId]/events?locationId=xxx
 *
 * Returns every imported event across all CalendarSources that point at
 * this GHL calendar, each tagged with its source id/label so the merged
 * calendar view can distinguish "World Cup" events from "Holiday events"
 * even though they land on the same GHL calendar.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ghlCalendarId: string }> }
) {
  const { ghlCalendarId } = await params;
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  const sources = await prisma.calendarSource.findMany({
    where: { ghlCalendarId, location: { locationId } },
    include: {
      importedEvents: {
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (sources.length === 0) {
    return NextResponse.json({ error: "No calendar sources found for this calendar" }, { status: 404 });
  }

  const events = sources.flatMap((source: typeof sources[number]) =>
    source.importedEvents.map((event: typeof source.importedEvents[number]) => ({
      id: event.id,
      externalUid: event.externalUid,
      startTime: event.startTime,
      endTime: event.endTime,
      title: event.title,
      allDay: event.allDay,
      ghlEventId: event.ghlEventId,
      sourceId: source.id,
      sourceLabel: source.label ?? source.url ?? "Uploaded file",
    }))
  );

  const sourceSummaries = sources.map((source: typeof sources[number]) => ({
    id: source.id,
    label: source.label ?? source.url ?? "Uploaded file",
    eventCount: source.importedEvents.length,
  }));

  return NextResponse.json({ ghlCalendarId, sources: sourceSummaries, events });
}
