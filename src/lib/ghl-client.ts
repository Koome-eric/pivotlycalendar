import { getValidAccessToken } from "@/lib/token-manager";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
// Some calendar endpoints (event listing, blocked-slots listing, calendar delete)
// have not been migrated to 2021-07-28 and require the older version header.
const GHL_API_VERSION_LEGACY = "2021-04-15";

export class GhlApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "GhlApiError";
  }
}

/**
 * Makes an authenticated request to the GHL v2 API on behalf of `locationId`.
 *
 * Automatically fetches (or refreshes) the access token before each call.
 * Throws `GhlApiError` on non-2xx responses.
 *
 * @example
 * const data = await ghlFetch(locationId, "/calendars/", { method: "GET" });
 */
export async function ghlFetch<T = unknown>(
  locationId: string,
  path: string,
  init: RequestInit = {},
  apiVersion: string = GHL_API_VERSION
): Promise<T> {
  const token = await getValidAccessToken(locationId);

  const url = `${GHL_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: apiVersion,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new GhlApiError(
      `GHL API ${res.status} on ${init.method ?? "GET"} ${path}`,
      res.status,
      data
    );
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Typed helpers for the endpoints this app actually needs
// ---------------------------------------------------------------------------

export interface GhlCalendar {
  id: string;
  name: string;
  locationId: string;
  isActive?: boolean;
  calendarType?: "round_robin" | "event" | "class_booking" | "collective" | "service_booking" | "personal";
}

/** Lists all calendars for a location. */
export async function listCalendars(locationId: string): Promise<GhlCalendar[]> {
  const data = await ghlFetch<{ calendars: GhlCalendar[] }>(
    locationId,
    `/calendars/?locationId=${encodeURIComponent(locationId)}`
  );
  return data.calendars ?? [];
}

export interface CreateCalendarPayload {
  name: string;
  locationId: string;
  description?: string;
  calendarType?: "round_robin" | "event" | "class_booking" | "collective" | "service_booking" | "personal";
}

/**
 * Creates a new calendar in a location. Returns the created calendar.
 *
 * `calendarType` defaults to "event" — GHL's block-slot endpoint rejects
 * calendars of other types with "The calendar is not an event calendar.",
 * and GHL does NOT default new calendars to this type on its own, so this
 * must always be set explicitly for calendars this app creates for imports.
 */
export async function createCalendar(
  locationId: string,
  payload: CreateCalendarPayload
): Promise<GhlCalendar> {
  const data = await ghlFetch<{ calendar: GhlCalendar }>(locationId, `/calendars/`, {
    method: "POST",
    body: JSON.stringify({ calendarType: "event", ...payload }),
  });
  return data.calendar;
}

export interface CreateBlockSlotPayload {
  calendarId: string;
  locationId: string;
  startTime: string; // ISO-8601
  endTime: string;   // ISO-8601
  title?: string;
}

export interface GhlBlockSlot {
  id: string;
  calendarId: string;
  locationId: string;
  startTime: string;
  endTime: string;
  title?: string;
}

/** Creates a blocked slot (prevents bookings during that window). */
export async function createBlockSlot(
  locationId: string,
  payload: CreateBlockSlotPayload
): Promise<GhlBlockSlot> {
  // GHL returns the block-slot object directly (no `{ event: ... }` wrapper):
  // { id, locationId, title, startTime, endTime, calendarId, assignedUserId }
  const data = await ghlFetch<GhlBlockSlot>(
    locationId,
    `/calendars/events/block-slots`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  if (!data || !data.id) {
    throw new GhlApiError(
      "GHL returned a successful response with no slot id",
      200,
      data
    );
  }
  return data;
}

/** Deletes a block slot by its GHL event ID. */
export async function deleteBlockSlot(
  locationId: string,
  eventId: string
): Promise<void> {
  await ghlFetch(
    locationId,
    `/calendars/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
    GHL_API_VERSION_LEGACY
  );
}

/** Fetches a single calendar's details by ID. */
export async function getCalendarById(
  locationId: string,
  calendarId: string
): Promise<GhlCalendar | null> {
  try {
    const data = await ghlFetch<{ calendar: GhlCalendar }>(
      locationId,
      `/calendars/${encodeURIComponent(calendarId)}`,
      { method: "GET" },
      GHL_API_VERSION_LEGACY
    );
    return data.calendar ?? null;
  } catch (err) {
    if (err instanceof GhlApiError && err.status === 404) return null;
    throw err;
  }
}

/** Deletes an entire calendar in GHL (and everything on it). */
export async function deleteCalendar(
  locationId: string,
  calendarId: string
): Promise<void> {
  await ghlFetch(
    locationId,
    `/calendars/${encodeURIComponent(calendarId)}`,
    { method: "DELETE" },
    GHL_API_VERSION_LEGACY
  );
}