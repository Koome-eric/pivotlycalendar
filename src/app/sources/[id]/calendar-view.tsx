"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  format,
  isToday,
} from "date-fns";

interface ImportedEvent {
  id: string;
  externalUid: string;
  startTime: string;
  endTime: string;
  title: string | null;
  allDay: boolean;
  ghlEventId: string | null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SourceCalendarView({
  events,
  loading,
  onSelectEvent,
}: {
  events: ImportedEvent[];
  loading: boolean;
  onSelectEvent: (event: ImportedEvent) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const hasSetInitialMonth = useRef(false);

  // Once the real event list arrives, jump to the month of the first
  // upcoming (or most recent, if all are in the past) event — so opening
  // the calendar doesn't land on an empty "today" month for imports that
  // are entirely in the future (e.g. World Cup 2026 fixtures). Runs only
  // once: after that, month navigation is fully user-controlled.
  useEffect(() => {
    if (hasSetInitialMonth.current || events.length === 0) return;
    hasSetInitialMonth.current = true;
    const now = Date.now();
    const upcoming = events.find((e) => new Date(e.startTime).getTime() >= now);
    setVisibleMonth(new Date((upcoming ?? events[0]).startTime));
  }, [events]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth));
    const end = endOfWeek(endOfMonth(visibleMonth));
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ImportedEvent[]>();
    for (const ev of events) {
      const key = format(new Date(ev.startTime), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [events]);

  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button
          onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
          className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
          aria-label="Previous month"
        >
          ←
        </button>
        <p className="text-sm font-medium text-foreground">{format(visibleMonth, "MMMM yyyy")}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVisibleMonth(new Date())}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
          >
            Today
          </button>
          <button
            onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-16 text-center text-xs text-muted">Loading events…</div>
      ) : (
        <>
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-border bg-background/40">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, visibleMonth);
              const today = isToday(day);
              const isExpanded = expandedDay === key;
              const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, 3);
              const hiddenCount = dayEvents.length - visibleEvents.length;

              return (
                <div
                  key={key}
                  className={`min-h-[88px] border-b border-r border-border p-1.5 ${
                    inMonth ? "" : "bg-background/20"
                  }`}
                >
                  <p
                    className={`text-[11px] mb-1 ${
                      today
                        ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent font-medium text-accent-foreground"
                        : inMonth
                        ? "text-foreground"
                        : "text-muted/50"
                    }`}
                  >
                    {format(day, "d")}
                  </p>
                  <div className="space-y-1">
                    {visibleEvents.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        title={ev.title ?? "Busy"}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight text-accent-foreground bg-accent/80 hover:bg-accent transition"
                      >
                        {ev.allDay ? "" : format(new Date(ev.startTime), "HH:mm ")}
                        {ev.title ?? "Busy"}
                      </button>
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => setExpandedDay(isExpanded ? null : key)}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-muted hover:text-foreground"
                      >
                        +{hiddenCount} more
                      </button>
                    )}
                    {isExpanded && dayEvents.length > 3 && (
                      <button
                        onClick={() => setExpandedDay(null)}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-muted hover:text-foreground"
                      >
                        Show less
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
