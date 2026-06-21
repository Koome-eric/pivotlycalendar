"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { SourceCalendarView } from "./calendar-view";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportJob {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string | null;
  completedAt: string | null;
  eventsCreated: number;
  eventsSkipped: number;
  eventsFailed: number;
  syncLogs: { message: string }[];
}

interface CalendarSource {
  id: string;
  sourceType: "ICS_URL" | "ICS_FILE";
  url: string | null;
  label: string | null;
  ghlCalendarId: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  importJobs: ImportJob[];
}

interface ImportedEvent {
  id: string;
  externalUid: string;
  startTime: string;
  endTime: string;
  title: string | null;
  allDay: boolean;
  ghlEventId: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr: string, allDay: boolean) {
  const d = new Date(dateStr);
  return allDay ? format(d, "MMM d, yyyy") : format(d, "MMM d, yyyy HH:mm");
}

function statusColor(status: ImportJob["status"]) {
  if (status === "SUCCESS") return "text-green-400";
  if (status === "FAILED") return "text-danger";
  return "text-accent";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SourceDetailView({
  initialSource,
  initialEvents,
  initialPagination,
  locationId,
}: {
  initialSource: CalendarSource;
  initialEvents: ImportedEvent[];
  initialPagination: Pagination;
  locationId: string;
}) {
  const router = useRouter();

  const [source, setSource] = useState(initialSource);
  const [events, setEvents] = useState(initialEvents);
  const [pagination, setPagination] = useState(initialPagination);
  const [search, setSearch] = useState("");

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [allEvents, setAllEvents] = useState<ImportedEvent[] | null>(null);
  const [loadingAllEvents, setLoadingAllEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ImportedEvent | null>(null);

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(source.label ?? "");
  const [savingLabel, setSavingLabel] = useState(false);

  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteGhlCalendarToo, setDeleteGhlCalendarToo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastJob = source.importJobs[0];
  const isWrongCalendarType = !!lastJob?.syncLogs[0]?.message.includes("not an event calendar");

  // ── Label editing ─────────────────────────────────────────────────────────
  async function saveLabel() {
    const trimmed = labelDraft.trim();
    if (!trimmed) return;
    setSavingLabel(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not rename source");
      setSource((s) => ({ ...s, label: data.source.label }));
      setEditingLabel(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingLabel(false);
    }
  }

  // ── Toggle auto-sync ──────────────────────────────────────────────────────
  async function toggleActive() {
    setError(null);
    const next = !source.isActive;
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update source");
      setSource((s) => ({ ...s, isActive: data.source.isActive }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // ── Delete a single event ─────────────────────────────────────────────────
  async function deleteEvent(eventId: string) {
    setDeletingEventId(eventId);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}/events/${eventId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete event");
      setEvents((evs) => evs.filter((e) => e.id !== eventId));
      setAllEvents((evs) => (evs ? evs.filter((e) => e.id !== eventId) : evs));
      setPagination((p) => ({ ...p, total: p.total - 1 }));
      setSelectedEvent((sel) => (sel?.id === eventId ? null : sel));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingEventId(null);
    }
  }

  // ── Delete the whole source ───────────────────────────────────────────────
  async function deleteSource() {
    setDeletingSource(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sources/${source.id}?deleteGhlCalendar=${deleteGhlCalendarToo}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete source");
      router.push(`/dashboard?locationId=${encodeURIComponent(locationId)}`);
    } catch (err) {
      setError((err as Error).message);
      setDeletingSource(false);
    }
  }

  // ── Calendar view: load every event once, regardless of pagination ───────
  async function loadAllEvents() {
    if (allEvents !== null) return; // already cached
    setLoadingAllEvents(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}?all=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load events");
      setAllEvents(data.events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingAllEvents(false);
    }
  }

  function switchView(mode: "list" | "calendar") {
    setViewMode(mode);
    if (mode === "calendar") loadAllEvents();
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  async function goToPage(page: number) {
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}?page=${page}&pageSize=${pagination.pageSize}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load events");
      setEvents(data.events);
      setPagination(data.pagination);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const filteredEvents = search.trim()
    ? events.filter((e) => (e.title ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    : events;

  return (
    <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
      <Link
        href={`/dashboard?locationId=${encodeURIComponent(locationId)}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← Dashboard
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingLabel ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveLabel()}
                className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-1.5 text-lg font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={saveLabel}
                disabled={savingLabel}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {savingLabel ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditingLabel(false); setLabelDraft(source.label ?? ""); }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="text-xl font-semibold text-foreground truncate flex items-center gap-2">
              {source.label ?? source.url ?? "Uploaded file"}
              <button
                onClick={() => setEditingLabel(true)}
                className="text-xs font-normal text-muted hover:text-accent"
                title="Rename"
              >
                ✎
              </button>
            </h1>
          )}
          <p className="mt-1 text-xs text-muted truncate">
            {source.sourceType === "ICS_URL" ? "URL" : "File"}
            {source.url && <> · <span className="font-mono">{source.url}</span></>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Calendar <code className="font-mono">{source.ghlCalendarId}</code> ·{" "}
            {source.isActive ? (
              <span className="text-green-400">Auto-sync on</span>
            ) : (
              <span className="text-muted">Auto-sync off</span>
            )}
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* Latest job summary */}
      {lastJob && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className={`text-sm font-medium ${statusColor(lastJob.status)}`}>{lastJob.status}</p>
            <p className="text-xs text-muted">
              {lastJob.completedAt ? format(new Date(lastJob.completedAt), "MMM d, yyyy HH:mm") : "In progress"}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted">
            {lastJob.eventsCreated} created · {lastJob.eventsSkipped} skipped
            {lastJob.eventsFailed > 0 && <span className="text-danger"> · {lastJob.eventsFailed} failed</span>}
          </p>
        </div>
      )}

      {isWrongCalendarType && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm text-foreground font-medium">This calendar can&apos;t hold blocked slots</p>
          <p className="mt-1 text-xs text-muted">
            GHL calendar <code className="font-mono">{source.ghlCalendarId}</code> isn&apos;t an{" "}
            <span className="text-foreground">Event</span>-type calendar, and GHL doesn&apos;t allow
            changing a calendar&apos;s type after it&apos;s created. The fix is to re-import into a brand
            new calendar — use Re-import below and choose &ldquo;+ Create a new calendar&rdquo;.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-3">
        {source.sourceType === "ICS_URL" && source.url && (
          <Link
            href={`/import?locationId=${encodeURIComponent(locationId)}&prefill=${encodeURIComponent(source.url)}`}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:border-accent transition"
          >
            Re-import
          </Link>
        )}
        <button
          onClick={toggleActive}
          className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:border-accent transition"
        >
          {source.isActive ? "Pause auto-sync" : "Resume auto-sync"}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-lg border border-danger/40 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition"
        >
          Delete source
        </button>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-4 space-y-3">
          <p className="text-sm text-foreground font-medium">Delete this calendar source?</p>
          <p className="text-xs text-muted">
            This removes all {pagination.total} imported event{pagination.total !== 1 ? "s" : ""} from this
            source&apos;s history and deletes the matching blocked slots in GHL.
          </p>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={deleteGhlCalendarToo}
              onChange={(e) => setDeleteGhlCalendarToo(e.target.checked)}
              className="rounded border-border"
            />
            Also delete the GHL calendar itself ({source.ghlCalendarId}) — only do this if nothing
            else uses that calendar
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg border border-border px-4 py-2 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={deleteSource}
              disabled={deletingSource}
              className="rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {deletingSource ? "Deleting…" : "Yes, delete permanently"}
            </button>
          </div>
        </div>
      )}

      {/* Events */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-medium text-muted">
            Events ({pagination.total})
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border p-0.5">
              <button
                onClick={() => switchView("list")}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  viewMode === "list" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                List
              </button>
              <button
                onClick={() => switchView("calendar")}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  viewMode === "calendar" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Calendar
              </button>
            </div>
            {viewMode === "list" && (
              <input
                type="text"
                placeholder="Filter by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>
        </div>

        {viewMode === "calendar" ? (
          <SourceCalendarView
            events={allEvents ?? []}
            loading={loadingAllEvents}
            onSelectEvent={setSelectedEvent}
          />
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">
              {search ? "No events match that filter." : "No events imported yet."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">Title</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">Start</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">End</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">Synced</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-background/50">
                      <td className="px-4 py-2 text-foreground">{ev.title ?? "Busy"}</td>
                      <td className="px-4 py-2 text-muted">{fmt(ev.startTime, ev.allDay)}</td>
                      <td className="px-4 py-2 text-muted">{fmt(ev.endTime, ev.allDay)}</td>
                      <td className="px-4 py-2 text-muted">
                        {ev.ghlEventId ? (
                          <span className="text-green-400">✓ GHL</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteEvent(ev.id)}
                          disabled={deletingEventId === ev.id}
                          className="text-danger hover:underline disabled:opacity-50"
                        >
                          {deletingEventId === ev.id ? "Removing…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {viewMode === "list" && pagination.totalPages > 1 && !search && (
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-border px-3 py-1.5 hover:text-foreground disabled:opacity-40"
            >
              ← Prev
            </button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-border px-3 py-1.5 hover:text-foreground disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Event detail popover (calendar view) */}
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
                onClick={() => deleteEvent(selectedEvent.id)}
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