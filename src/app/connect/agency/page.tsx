"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ConnectAgencyPage() {
  const router = useRouter();
  const [locationId, setLocationId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!locationId.trim() || !apiKey.trim()) {
      setError("Both fields are required.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/connect/agency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: locationId.trim(), apiKey: apiKey.trim(), label: label.trim() }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Connection failed.");
      return;
    }

    router.push(`/dashboard?locationId=${encodeURIComponent(data.locationId)}`);
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-xs text-muted hover:text-foreground">← Back</Link>

        <h1 className="mt-4 text-xl font-semibold text-foreground">
          Connect via Agency API Key
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Use an agency-level API key to connect any sub-account within your agency.
          Find your key at{" "}
          <span className="text-foreground">GHL → Settings → Agency → API Keys</span>.
        </p>

        <div className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-6">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Sub-account Location ID
            </label>
            <input
              type="text"
              placeholder="e.g. abc123xyz"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-muted">
              Found in GHL → Sub-Accounts → click location → Settings → Business Profile
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Agency API Key
            </label>
            <input
              type="password"
              placeholder="Paste API key here"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Label <span className="text-muted">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Real Estate Office"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Validating…" : "Connect location"}
          </button>
        </div>
      </div>
    </main>
  );
}
