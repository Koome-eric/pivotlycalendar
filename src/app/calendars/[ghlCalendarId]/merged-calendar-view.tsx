"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { SourceCalendarView, type ImportedEvent } from "../../sources/[id]/calendar-view";

// In the merged view every event always carries its source — narrow the
// shared (optional-field) ImportedEvent type to make that guarantee explicit.
type MergedEvent = ImportedEvent & { sourceId: string; sourceLabel: string };

interface SourceSummary {
  id: string;
  label: string;
  eventCount: number;
}

function fmt(dateStr: string, allDay: boolean) {
  const d = new Date(dateStr);
  return allDay ? format(d, "MMM d, yyyy") : format(d, "MMM d, yyyy HH:mm");
}

export function MergedCalendarView({
  ghlCalendarId,
  locationId,
  initialEvents,
  sources,
}: {
  ghlCalendarId: string;
  locationId: string;
  initialEvents: MergedEvent[];
  sources: SourceSummary[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [selectedEvent, setSelectedEvent] = useState<MergedEvent | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteEvent(event: MergedEvent) {
    setDeletingEventId(event.id);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${event.sourceId}/events/${event.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete event");
      setEvents((evs) => evs.filter((e) => e.id !== event.id));
      setSelectedEvent((sel) => (sel?.id === event.id ? null : sel));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingEventId(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
      <Link
        href={`/calendars?locationId=${encodeURIComponent(locationId)}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← All calendars
      </Link>

      <div className="mt-4">
        <h1 className="text-xl font-semibold text-foreground">
          Calendar <code className="font-mono text-base">{ghlCalendarId}</code>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {sources.length} source{sources.length !== 1 ? "s" : ""} merged · {events.length} event
          {events.length !== 1 ? "s" : ""} total
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* Contributing sources */}
      <div className="mt-4 flex flex-wrap gap-2">
        {sources.map((s) => (
          <Link
            key={s.id}
            href={`/sources/${s.id}`}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:border-accent transition"
          >
            {s.label} <span className="text-muted">({s.eventCount})</span>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <SourceCalendarView
          events={events}
          loading={false}
          onSelectEvent={(ev) => setSelectedEvent(ev as MergedEvent)}
          sources={sources}
        />
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{selectedEvent.title ?? "Busy"}</h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-muted hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted">
              <p>
                <span className="text-foreground">Start:</span> {fmt(selectedEvent.startTime, selectedEvent.allDay)}
              </p>
              <p>
                <span className="text-foreground">End:</span> {fmt(selectedEvent.endTime, selectedEvent.allDay)}
              </p>
              <p>
                <span className="text-foreground">Source:</span>{" "}
                <Link href={`/sources/${selectedEvent.sourceId}`} className="text-accent hover:underline">
                  {selectedEvent.sourceLabel}
                </Link>
              </p>
              <p>
                <span className="text-foreground">Synced to GHL:</span>{" "}
                {selectedEvent.ghlEventId ? (
                  <span className="text-green-400">✓ Yes</span>
                ) : (
                  <span className="text-muted">No</span>
                )}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => deleteEvent(selectedEvent)}
                disabled={deletingEventId === selectedEvent.id}
                className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {deletingEventId === selectedEvent.id ? "Removing…" : "Remove from calendar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
