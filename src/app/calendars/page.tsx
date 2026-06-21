import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { format } from "date-fns";

export default async function CalendarsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { locationId } = await searchParams;
  if (!locationId) redirect("/");

  const location = await prisma.location.findUnique({ where: { locationId } });
  if (!location) redirect("/");

  const sources = await prisma.calendarSource.findMany({
    where: { location: { locationId } },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { importedEvents: true } },
    },
  });

  type SourceRow = typeof sources[number];
  type CalendarGroup = { ghlCalendarId: string; sources: SourceRow[]; eventCount: number; lastSyncAt: Date | null };

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

  return (
    <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
      <Link
        href={`/dashboard?locationId=${encodeURIComponent(locationId)}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← Dashboard
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-foreground">GHL calendars</h1>
      <p className="mt-1 text-sm text-muted">
        Every GHL calendar with blocked slots from {location.name ?? location.locationId}. When two
        sources share a calendar, their events appear merged here — exactly as they show up in GHL.
      </p>

      <div className="mt-6 space-y-3">
        {calendars.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">No calendars yet — import a source first.</p>
            <Link
              href={`/import?locationId=${encodeURIComponent(locationId)}`}
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Import a calendar →
            </Link>
          </div>
        ) : (
          calendars.map((cal) => (
            <Link
              key={cal.ghlCalendarId}
              href={`/calendars/${encodeURIComponent(cal.ghlCalendarId)}?locationId=${encodeURIComponent(locationId)}`}
              className="block rounded-xl border border-border bg-surface p-4 hover:border-accent transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Calendar <code className="font-mono text-xs">{cal.ghlCalendarId}</code>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {cal.sources.length} source{cal.sources.length !== 1 ? "s" : ""} ·{" "}
                    {cal.eventCount} event{cal.eventCount !== 1 ? "s" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {cal.sources.map((s: SourceRow) => s.label ?? s.url ?? "Uploaded file").join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">
                    {cal.lastSyncAt ? `Synced ${format(cal.lastSyncAt, "MMM d, HH:mm")}` : "Never synced"}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
