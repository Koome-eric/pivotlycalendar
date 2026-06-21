import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteBlockSlot, deleteCalendar, GhlApiError } from "@/lib/ghl-client";

/**
 * GET /api/sources/[id]
 * Returns the source, its most recent import job, and its imported events.
 *
 * Default mode is paginated (?page=&pageSize=), used by the list view.
 * ?all=true bypasses pagination and returns every event for the source —
 * used by the calendar-grid view, which needs the full set to render
 * correctly regardless of which month is showing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const all = searchParams.get("all") === "true";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));

  const source = await prisma.calendarSource.findUnique({
    where: { id },
    include: {
      importJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          syncLogs: { where: { status: "error" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Calendar source not found" }, { status: 404 });
  }

  if (all) {
    const events = await prisma.importedEvent.findMany({
      where: { calendarSourceId: id },
      orderBy: { startTime: "asc" },
    });
    return NextResponse.json({ source, events, pagination: null });
  }

  const [events, totalEvents] = await Promise.all([
    prisma.importedEvent.findMany({
      where: { calendarSourceId: id },
      orderBy: { startTime: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.importedEvent.count({ where: { calendarSourceId: id } }),
  ]);

  return NextResponse.json({
    source,
    events,
    pagination: { page, pageSize, total: totalEvents, totalPages: Math.ceil(totalEvents / pageSize) || 1 },
  });
}

/**
 * PATCH /api/sources/[id]
 * Body: { label?: string, isActive?: boolean }
 * Renames the source or toggles auto-sync (isActive).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { label?: string; isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: { label?: string; isActive?: boolean } = {};
  if (typeof body.label === "string") {
    const trimmed = body.label.trim();
    if (!trimmed) return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
    data.label = trimmed;
  }
  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const source = await prisma.calendarSource.update({ where: { id }, data });
    return NextResponse.json({ source });
  } catch {
    return NextResponse.json({ error: "Calendar source not found" }, { status: 404 });
  }
}

/**
 * DELETE /api/sources/[id]?deleteGhlCalendar=true
 *
 * Removes the calendar source. By default this also deletes every block
 * slot this app created in GHL (so the calendar doesn't keep stale entries),
 * then removes our DB records (cascades to ImportJob/SyncLog/ImportedEvent).
 *
 * If deleteGhlCalendar=true, the entire GHL calendar is deleted instead of
 * just its block slots — use when the calendar was created solely for this
 * import and nothing else lives on it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleteGhlCalendar = request.nextUrl.searchParams.get("deleteGhlCalendar") === "true";

  const source = await prisma.calendarSource.findUnique({
    where: { id },
    include: { location: true, importedEvents: true },
  });

  if (!source) {
    return NextResponse.json({ error: "Calendar source not found" }, { status: 404 });
  }

  const locationId = source.location.locationId;
  const ghlErrors: string[] = [];

  if (deleteGhlCalendar) {
    try {
      await deleteCalendar(locationId, source.ghlCalendarId);
    } catch (err) {
      // If GHL already doesn't have this calendar, that's fine — proceed with cleanup.
      if (!(err instanceof GhlApiError && err.status === 404)) {
        ghlErrors.push(`Could not delete GHL calendar: ${(err as Error).message}`);
      }
    }
  } else {
    // Delete each block slot individually so the calendar itself survives.
    const eventsWithGhlId = source.importedEvents.filter(
      (e: typeof source.importedEvents[number]) => e.ghlEventId !== null
    );
    for (const event of eventsWithGhlId) {
      try {
        await deleteBlockSlot(locationId, event.ghlEventId!);
      } catch (err) {
        if (!(err instanceof GhlApiError && err.status === 404)) {
          ghlErrors.push(`"${event.title ?? event.externalUid}": ${(err as Error).message}`);
        }
      }
    }
  }

  await prisma.calendarSource.delete({ where: { id } });

  return NextResponse.json({
    ok: true,
    deletedGhlCalendar: deleteGhlCalendar,
    ghlErrors: ghlErrors.length ? ghlErrors : undefined,
  });
}