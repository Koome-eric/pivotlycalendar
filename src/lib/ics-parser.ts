/* eslint-disable @typescript-eslint/no-explicit-any */
import ical from "node-ical";
import { addMonths } from "date-fns";

export interface ParsedEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  isRecurring: boolean;
}

export interface ParseResult {
  events: ParsedEvent[];
  totalExpanded: number;
  warnings: string[];
}

const RECURRENCE_MONTHS = 12;
const MAX_EVENTS = 500;

export async function parseIcsUrl(url: string): Promise<ParseResult> {
  let data: ical.CalendarResponse;
  try {
    data = await ical.async.fromURL(url);
  } catch (err) {
    throw new Error(`Could not fetch calendar URL: ${(err as Error).message}`);
  }
  return processCalendar(data);
}

export function parseIcsText(text: string): ParseResult {
  let data: ical.CalendarResponse;
  try {
    data = ical.parseICS(text);
  } catch (err) {
    throw new Error(`Could not parse ICS content: ${(err as Error).message}`);
  }
  return processCalendar(data);
}

function processCalendar(data: ical.CalendarResponse): ParseResult {
  const warnings: string[] = [];
  const events: ParsedEvent[] = [];
  const now = new Date();
  const windowEnd = addMonths(now, RECURRENCE_MONTHS);

  for (const key of Object.keys(data)) {
    const raw = data[key];
    if (!raw || raw.type !== "VEVENT") continue;
    const vevent = raw as ical.VEvent;

    try {
      if (vevent.rrule) {
        const expanded = expandRecurring(vevent, now, windowEnd);
        events.push(...expanded);
      } else {
        const parsed = parseSingle(vevent);
        if (parsed && parsed.end >= now) events.push(parsed);
      }
    } catch (err) {
      warnings.push(`Skipped "${(vevent as any).summary ?? key}": ${(err as Error).message}`);
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  const totalExpanded = events.length;
  if (totalExpanded > MAX_EVENTS) {
    warnings.push(
      `${totalExpanded} events found — only the first ${MAX_EVENTS} are shown.`
    );
  }

  return { events: events.slice(0, MAX_EVENTS), totalExpanded, warnings };
}

function parseSingle(vevent: ical.VEvent): ParsedEvent | null {
  if (!vevent.start) return null;
  const start = toDate(vevent.start);
  if (isNaN(start.getTime())) {
    throw new Error("Invalid start date");
  }

  const allDay = isAllDay(vevent);
  let end = vevent.end ? toDate(vevent.end) : new Date(start.getTime() + 3_600_000);

  if (isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    // All-day ICS entries frequently omit DTEND or set it equal to DTSTART.
    // GHL rejects zero/negative-duration block slots, so give all-day events
    // a full 24h span and everything else a 1h fallback.
    end = new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
  }

  return {
    uid: vevent.uid ?? `evt_${start.toISOString()}`,
    title: summaryStr(vevent),
    start,
    end,
    allDay,
    isRecurring: false,
  };
}

function expandRecurring(vevent: ical.VEvent, from: Date, to: Date): ParsedEvent[] {
  const allDay = isAllDay(vevent);
  const rawStart = toDate(vevent.start);
  const rawEnd = vevent.end ? toDate(vevent.end) : null;
  let duration = rawEnd ? rawEnd.getTime() - rawStart.getTime() : 0;

  if (duration <= 0) {
    duration = allDay ? 86_400_000 : 3_600_000;
  }

  try {
    const occurrences: Record<string, any> = ical.expandRecurringEvent(vevent, { from, to });
    return Object.values(occurrences).map((occ: any) => {
      const start = toDate(occ.start);
      return {
        uid: `${vevent.uid ?? "evt"}_${start.toISOString()}`,
        title: summaryStr(vevent),
        start,
        end: new Date(start.getTime() + duration),
        allDay,
        isRecurring: true,
      };
    });
  } catch {
    // Graceful fallback: return just the base occurrence if expansion fails.
    const start = toDate(vevent.start);
    if (start < from || start > to) return [];
    return [{
      uid: `${vevent.uid ?? "evt"}_${start.toISOString()}`,
      title: summaryStr(vevent),
      start,
      end: new Date(start.getTime() + duration),
      allDay,
      isRecurring: true,
    }];
  }
}

function isAllDay(vevent: ical.VEvent): boolean {
  return (vevent as any).datetype === "date";
}

function summaryStr(vevent: ical.VEvent): string {
  const s = (vevent as any).summary;
  if (!s) return "Busy";
  if (typeof s === "string") return s;
  if (s?.val) return String(s.val);
  return String(s);
}

function toDate(val: any): Date {
  return val instanceof Date ? val : new Date(val);
}