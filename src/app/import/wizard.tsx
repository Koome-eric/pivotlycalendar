"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  isRecurring: boolean;
}

interface PreviewResult {
  events: ParsedEvent[];
  totalExpanded: number;
  warnings: string[];
}

interface GhlCalendar {
  id: string;
  name: string;
}

type Step = "source" | "preview" | "confirm";
type SourceMethod = "url" | "file";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr: string, allDay: boolean) {
  const d = new Date(dateStr);
  return allDay ? format(d, "MMM d, yyyy") : format(d, "MMM d, yyyy HH:mm");
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepBadge({ current, label, num }: { current: boolean; label: string; num: number }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${current ? "text-accent" : "text-muted"}`}>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
          current ? "bg-accent text-accent-foreground" : "bg-border text-muted"
        }`}
      >
        {num}
      </span>
      {label}
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function ImportWizard({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("source");

  // Step 1 state
  const [method, setMethod] = useState<SourceMethod>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Step 3 state
  const [calendars, setCalendars] = useState<GhlCalendar[]>([]);
  const [calendarId, setCalendarId] = useState("new");
  const [newCalendarName, setNewCalendarName] = useState("Imported Events");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // ── Step 1: fetch preview ─────────────────────────────────────────────────
  async function runPreview() {
    setPreviewing(true);
    setPreviewError(null);

    try {
      let res: Response;

      if (method === "url") {
        res = await fetch("/api/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "ICS_URL", url }),
        });
      } else {
        if (!file) { setPreviewError("Please select a file."); setPreviewing(false); return; }
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/import/preview", { method: "POST", body: form });
      }

      const data = await res.json();
      if (!res.ok) { setPreviewError(data.error ?? "Parse failed."); setPreviewing(false); return; }

      setPreview(data as PreviewResult);

      // Also fetch GHL calendars for step 3
      const calRes = await fetch(`/api/calendars?locationId=${encodeURIComponent(locationId)}`);
      if (calRes.ok) {
        const calData = await calRes.json();
        setCalendars(calData.calendars ?? []);
      }

      setStep("preview");
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  // ── Step 3: confirm import ────────────────────────────────────────────────
  async function runConfirm() {
    setConfirming(true);
    setConfirmError(null);

    const body =
      method === "url"
        ? { locationId, ghlCalendarId: calendarId, newCalendarName, label, sourceType: "ICS_URL", url }
        : { locationId, ghlCalendarId: calendarId, newCalendarName, label, sourceType: "ICS_FILE", fileContent };

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) { setConfirmError(data.error ?? "Import failed."); setConfirming(false); return; }

      router.push(
        `/dashboard?locationId=${encodeURIComponent(locationId)}&imported=${data.created}`
      );
    } catch (err) {
      setConfirmError((err as Error).message);
      setConfirming(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (!f) { setFileContent(null); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target?.result as string ?? null);
    reader.readAsText(f);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl">
      <Link href={`/dashboard?locationId=${encodeURIComponent(locationId)}`} className="text-xs text-muted hover:text-foreground">
        ← Dashboard
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-foreground">Import a calendar</h1>

      {/* Step indicators */}
      <div className="mt-4 flex gap-6">
        <StepBadge num={1} label="Source" current={step === "source"} />
        <StepBadge num={2} label="Preview" current={step === "preview"} />
        <StepBadge num={3} label="Confirm" current={step === "confirm"} />
      </div>

      {/* ── STEP 1: Source ─────────────────────────────────────────────────── */}
      {step === "source" && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-6 space-y-5">
          {/* Method toggle */}
          <div className="flex gap-2">
            {(["url", "file"] as SourceMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  method === m
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                {m === "url" ? "Calendar URL" : "Upload .ics file"}
              </button>
            ))}
          </div>

          {method === "url" ? (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Calendar URL</label>
              <input
                type="url"
                placeholder="https://calendar.google.com/…/basic.ics"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-muted">
                Any publicly accessible .ics URL — Google Calendar, Airbnb, Outlook, Calendly, etc.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">.ics file</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-8 text-sm text-muted hover:border-accent transition"
              >
                {file ? (
                  <span className="text-foreground">{file.name}</span>
                ) : (
                  <span>Click to select a .ics file</span>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".ics" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Label <span className="text-muted">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Airbnb calendar, Team vacation"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {previewError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {previewError}
            </p>
          )}

          <button
            onClick={runPreview}
            disabled={previewing || (method === "url" ? !url.trim() : !file)}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {previewing ? "Parsing calendar…" : "Preview events →"}
          </button>
        </div>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────────────────────── */}
      {step === "preview" && preview && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-foreground font-medium">
              {preview.events.length} event{preview.events.length !== 1 ? "s" : ""} found
              {preview.totalExpanded > preview.events.length && (
                <span className="ml-2 text-xs text-muted">
                  ({preview.totalExpanded} total — showing first {preview.events.length})
                </span>
              )}
            </p>

            {preview.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-accent">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>

          {/* Event table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">Title</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">Start</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">End</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.events.map((ev, i) => (
                    <tr key={i} className="hover:bg-background/50">
                      <td className="px-4 py-2 text-foreground">{ev.title}</td>
                      <td className="px-4 py-2 text-muted">{fmt(ev.start, ev.allDay)}</td>
                      <td className="px-4 py-2 text-muted">{fmt(ev.end, ev.allDay)}</td>
                      <td className="px-4 py-2 text-muted">
                        {ev.allDay ? "All day" : ev.isRecurring ? "Recurring" : "Single"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("source")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground transition"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep("confirm")}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Choose calendar →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Confirm ────────────────────────────────────────────────── */}
      {step === "confirm" && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Import into GHL calendar
            </label>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="new">+ Create a new calendar</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {calendarId === "new" && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">New calendar name</label>
              <input
                type="text"
                value={newCalendarName}
                onChange={(e) => setNewCalendarName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted space-y-1">
            <p className="text-foreground font-medium">Summary</p>
            <p>Source: {method === "url" ? url : file?.name}</p>
            <p>Events: {preview?.events.length ?? 0}</p>
            <p>Type: {method === "url" ? "Calendar URL (auto-syncs)" : "File upload (one-time)"}</p>
          </div>

          {confirmError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {confirmError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("preview")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground transition"
            >
              ← Back
            </button>
            <button
              onClick={runConfirm}
              disabled={confirming}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {confirming ? "Importing events…" : "Import & block slots"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
