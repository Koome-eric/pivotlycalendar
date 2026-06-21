import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { MergedCalendarView } from "./merged-calendar-view";

export default async function MergedCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ ghlCalendarId: string }>;
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { ghlCalendarId } = await params;
  const { locationId } = await searchParams;
  if (!locationId) redirect("/");

  const sources = await prisma.calendarSource.findMany({
    where: { ghlCalendarId, location: { locationId } },
    include: {
      importedEvents: { orderBy: { startTime: "asc" } },
    },
  });

  if (sources.length === 0) redirect(`/calendars?locationId=${encodeURIComponent(locationId)}`);

  type SourceRow = typeof sources[number];

  const events = sources.flatMap((source: SourceRow) =>
    source.importedEvents.map((event: SourceRow["importedEvents"][number]) => ({
      id: event.id,
      externalUid: event.externalUid,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      title: event.title,
      allDay: event.allDay,
      ghlEventId: event.ghlEventId,
      sourceId: source.id,
      sourceLabel: source.label ?? source.url ?? "Uploaded file",
    }))
  );

  const sourceSummaries = sources.map((source: SourceRow) => ({
    id: source.id,
    label: source.label ?? source.url ?? "Uploaded file",
    eventCount: source.importedEvents.length,
  }));

  return (
    <MergedCalendarView
      ghlCalendarId={ghlCalendarId}
      locationId={locationId}
      initialEvents={events}
      sources={sourceSummaries}
    />
  );
}
