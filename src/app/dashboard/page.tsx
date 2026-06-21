import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { CleanupFailedButton } from "./cleanup-failed-button";

const CONNECTION_LABELS: Record<string, string> = {
  OAUTH: "GHL Marketplace OAuth",
  PRIVATE_INTEGRATION: "Private Integration",
  AGENCY_KEY: "Agency API Key",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string; imported?: string }>;
}) {
  const { locationId, imported } = await searchParams;
  if (!locationId) redirect("/");

  const location = await prisma.location.findUnique({
    where: { locationId },
    include: {
      oauthToken: { select: { connectionType: true, expiresAt: true } },
      calendarSources: {
        orderBy: { createdAt: "desc" },
        include: {
          importJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              syncLogs: {
                where: { status: "error" },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
          _count: { select: { importedEvents: true } },
        },
      },
    },
  });

  if (!location) redirect("/");

  const connectionType = location.oauthToken?.connectionType ?? "OAUTH";
  const failedEmptyCount = location.calendarSources.filter((s: typeof location.calendarSources[number]) => {
    const lastJob = s.importJobs[0];
    return lastJob && lastJob.status === "FAILED" && lastJob.eventsCreated === 0;
  }).length;

  return (
    <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
      {/* Success banner */}
      {imported && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
          ✓ Successfully imported {imported} event{Number(imported) !== 1 ? "s" : ""} as blocked slots.
        </div>
      )}

      {/* Location header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Connected location</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {location.name ?? location.locationId}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {CONNECTION_LABELS[connectionType as string] ?? connectionType} ·{" "}
            <code className="font-mono">{location.locationId}</code>
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Link
            href={`/calendars?locationId=${encodeURIComponent(locationId)}`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-accent transition"
          >
            View calendars
          </Link>
          <Link
            href={`/import?locationId=${encodeURIComponent(locationId)}`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
          >
            + Add calendar source
          </Link>
        </div>
      </div>

      {/* Calendar sources */}
      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted mb-3">Calendar sources</h2>

        <CleanupFailedButton locationId={locationId} failedCount={failedEmptyCount} />

        {location.calendarSources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">No calendar sources yet.</p>
            <Link
              href={`/import?locationId=${encodeURIComponent(locationId)}`}
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Import your first calendar →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {location.calendarSources.map((source: typeof location.calendarSources[number]) => {
              const lastJob = source.importJobs[0];
              const statusColor =
                !lastJob ? "text-muted" :
                lastJob.status === "SUCCESS" ? "text-green-400" :
                lastJob.status === "FAILED" ? "text-danger" : "text-accent";

              return (
                <div key={source.id} className="rounded-xl border border-border bg-surface p-4">
                  <Link href={`/sources/${source.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate hover:text-accent transition">
                          {source.label ?? source.url ?? "Uploaded file"}
                          {!source.isActive && (
                            <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-normal text-muted align-middle">
                              Paused
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {source.sourceType === "ICS_URL" ? "URL" : "File"} ·{" "}
                          {source._count.importedEvents} event{source._count.importedEvents !== 1 ? "s" : ""}
                          {source.ghlCalendarId && (
                            <> · Calendar <code className="font-mono">{source.ghlCalendarId.slice(0, 8)}…</code></>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {lastJob ? (
                          <>
                            <p className={`text-xs font-medium ${statusColor}`}>
                              {lastJob.status}
                            </p>
                            <p className="text-xs text-muted">
                              {lastJob.completedAt
                                ? format(new Date(lastJob.completedAt), "MMM d, HH:mm")
                                : "In progress"}
                            </p>
                            <p className="text-xs text-muted">
                              {lastJob.eventsCreated} created · {lastJob.eventsSkipped} skipped
                              {lastJob.eventsFailed > 0 && (
                                <span className="text-danger"> · {lastJob.eventsFailed} failed</span>
                              )}
                            </p>
                            {lastJob.syncLogs[0] && (
                              <p className="mt-1 max-w-[220px] truncate text-xs text-danger/80" title={lastJob.syncLogs[0].message}>
                                {lastJob.syncLogs[0].message}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted">Never synced</p>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Quick actions */}
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-4">
                    <Link
                      href={`/sources/${source.id}`}
                      className="text-xs text-foreground hover:text-accent"
                    >
                      View &amp; manage
                    </Link>
                    {source.sourceType === "ICS_URL" && source.url && (
                      <Link
                        href={`/import?locationId=${encodeURIComponent(locationId)}&prefill=${encodeURIComponent(source.url)}`}
                        className="text-xs text-accent hover:underline"
                      >
                        Re-import
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="mt-10 flex items-center gap-4 text-xs text-muted">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>·</span>
        <span>Location: <code className="font-mono">{locationId}</code></span>
      </div>
    </main>
  );
}