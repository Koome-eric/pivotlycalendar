import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIcsUrl, parseIcsText, ParsedEvent } from "@/lib/ics-parser";
import { createBlockSlot, createCalendar, GhlApiError } from "@/lib/ghl-client";

interface ConfirmBody {
  locationId: string;
  ghlCalendarId: string;    // "new" to create a fresh calendar
  newCalendarName?: string; // required when ghlCalendarId === "new"
  label?: string;           // user label for this source, e.g. "Airbnb calendar"
  sourceType: "ICS_URL" | "ICS_FILE";
  url?: string;             // for ICS_URL
  fileContent?: string;     // for ICS_FILE — base64 or plain text
}

/**
 * POST /api/import/confirm
 *
 * Receives the confirmed import parameters, re-parses the ICS source (to get
 * the freshest data), then:
 *  1. Creates a CalendarSource record.
 *  2. Creates an ImportJob.
 *  3. Iterates over events — deduplicates, creates GHL block slots, records them.
 *  4. Marks the job SUCCESS or FAILED.
 *
 * Returns a summary: { created, skipped, failed, warnings }
 */
export async function POST(request: NextRequest) {
  let body: ConfirmBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { locationId, sourceType, url, fileContent, label, newCalendarName } = body;
  let { ghlCalendarId } = body;

  if (!locationId || !ghlCalendarId || !sourceType) {
    return NextResponse.json({ error: "locationId, ghlCalendarId, and sourceType are required" }, { status: 400 });
  }

  // ── 1. Re-parse the ICS source ───────────────────────────────────────────
  let events: ParsedEvent[];
  let warnings: string[];

  try {
    if (sourceType === "ICS_URL") {
      if (!url) return NextResponse.json({ error: "url is required for ICS_URL" }, { status: 400 });
      const result = await parseIcsUrl(url);
      events = result.events;
      warnings = result.warnings;
    } else {
      if (!fileContent) return NextResponse.json({ error: "fileContent is required for ICS_FILE" }, { status: 400 });
      const text = fileContent.startsWith("data:")
        ? Buffer.from(fileContent.split(",")[1], "base64").toString("utf-8")
        : fileContent;
      const result = parseIcsText(text);
      events = result.events;
      warnings = result.warnings;
    }
  } catch (err) {
    return NextResponse.json({ error: `Parse error: ${(err as Error).message}` }, { status: 422 });
  }

  // ── 2. Create a new GHL calendar if requested ────────────────────────────
  if (ghlCalendarId === "new") {
    if (!newCalendarName?.trim()) {
      return NextResponse.json({ error: "newCalendarName is required when ghlCalendarId is 'new'" }, { status: 400 });
    }
    try {
      const calendar = await createCalendar(locationId, {
        name: newCalendarName,
        locationId,
        description: "Imported external calendar events (managed by Calendar Import App)",
      });
      ghlCalendarId = calendar.id;
    } catch (err) {
      return NextResponse.json({ error: `Could not create GHL calendar: ${(err as Error).message}` }, { status: 500 });
    }
  }

  // ── 3. Create DB records ─────────────────────────────────────────────────
  const source = await prisma.calendarSource.create({
    data: {
      location: { connect: { locationId } },
      sourceType,
      url: sourceType === "ICS_URL" ? url : null,
      label: label ?? (sourceType === "ICS_URL" ? url : "Uploaded file"),
      ghlCalendarId,
    },
  });

  const job = await prisma.importJob.create({
    data: { calendarSourceId: source.id, status: "RUNNING", startedAt: new Date() },
  });

  // ── 4. Write block slots ─────────────────────────────────────────────────
  let created = 0, skipped = 0, failed = 0;
  const jobWarnings: string[] = [...warnings];

  for (const event of events) {
    // Deduplication check.
    const exists = await prisma.importedEvent.findUnique({
      where: {
        calendarSourceId_externalUid_startTime_endTime: {
          calendarSourceId: source.id,
          externalUid: event.uid,
          startTime: event.start,
          endTime: event.end,
        },
      },
    });

    if (exists) {
      skipped++;
      continue;
    }

    try {
      const block = await createBlockSlot(locationId, {
        calendarId: ghlCalendarId,
        locationId,
        startTime: event.start.toISOString(),
        endTime: event.end.toISOString(),
        title: event.title,
      });

      await prisma.importedEvent.create({
        data: {
          calendarSourceId: source.id,
          externalUid: event.uid,
          startTime: event.start,
          endTime: event.end,
          title: event.title,
          allDay: event.allDay,
          ghlEventId: block.id,
        },
      });

      created++;
    } catch (err) {
      failed++;
      const msg =
        err instanceof GhlApiError
          ? `GHL ${err.status} for "${event.title}" at ${event.start.toISOString()}: ${JSON.stringify(err.body)}`
          : `Failed "${event.title}": ${(err as Error).message}`;
      jobWarnings.push(msg);

      // Log individual failure to sync_logs.
      await prisma.syncLog.create({
        data: { importJobId: job.id, status: "error", message: msg },
      });
    }
  }

  // ── 5. Finalise job ──────────────────────────────────────────────────────
  const status = failed > 0 && created === 0 ? "FAILED" : "SUCCESS";
  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status,
      completedAt: new Date(),
      eventsCreated: created,
      eventsSkipped: skipped,
      eventsFailed: failed,
    },
  });

  await prisma.calendarSource.update({
    where: { id: source.id },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    sourceId: source.id,
    jobId: job.id,
    created,
    skipped,
    failed,
    warnings: jobWarnings,
  });
}