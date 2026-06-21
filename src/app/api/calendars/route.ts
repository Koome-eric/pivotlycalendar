import { NextRequest, NextResponse } from "next/server";
import { listCalendars } from "@/lib/ghl-client";

/**
 * GET /api/calendars?locationId=xxx
 * Returns the list of GHL "event"-type calendars for the given location.
 *
 * Block slots can only be created on calendars with calendarType "event" —
 * GHL rejects the request on any other type ("The calendar is not an event
 * calendar."). Non-event calendars (round robin, service booking, etc.) are
 * filtered out here so the import wizard can't offer a calendar that's
 * guaranteed to fail.
 */
export async function GET(request: NextRequest) {
  const locationId = new URL(request.url).searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  try {
    const allCalendars = await listCalendars(locationId);
    const calendars = allCalendars.filter((c) => !c.calendarType || c.calendarType === "event");
    return NextResponse.json({ calendars });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
