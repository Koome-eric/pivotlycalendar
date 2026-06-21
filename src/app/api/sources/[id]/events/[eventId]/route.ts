import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteBlockSlot, GhlApiError } from "@/lib/ghl-client";

/**
 * DELETE /api/sources/[id]/events/[eventId]
 * Removes a single imported event: deletes the block slot in GHL (if it has
 * one) and removes the local record. Lets you clean up individual entries
 * (e.g. a duplicate or a match that got rescheduled) without re-importing
 * the whole source.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id, eventId } = await params;

  const event = await prisma.importedEvent.findFirst({
    where: { id: eventId, calendarSourceId: id },
    include: { calendarSource: { include: { location: true } } },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.ghlEventId) {
    try {
      await deleteBlockSlot(event.calendarSource.location.locationId, event.ghlEventId);
    } catch (err) {
      if (!(err instanceof GhlApiError && err.status === 404)) {
        return NextResponse.json(
          { error: `Could not delete from GHL: ${(err as Error).message}` },
          { status: 502 }
        );
      }
    }
  }

  await prisma.importedEvent.delete({ where: { id: eventId } });

  return NextResponse.json({ ok: true });
}