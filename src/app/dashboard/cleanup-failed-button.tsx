"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CleanupFailedButton({ locationId, failedCount }: { locationId: string; failedCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (failedCount === 0) return null;

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/cleanup?locationId=${encodeURIComponent(locationId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cleanup failed");
      router.refresh();
      setConfirming(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mb-4">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-muted hover:text-danger transition"
        >
          🧹 Clean up {failedCount} failed import{failedCount !== 1 ? "s" : ""} that created nothing
        </button>
      ) : (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-foreground">
            Remove {failedCount} source{failedCount !== 1 ? "s" : ""} with 0 events created? This only
            removes empty/failed attempts — nothing that&apos;s live in GHL is touched.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={run}
              disabled={running}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {running ? "Cleaning…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}