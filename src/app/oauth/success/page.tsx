import Link from "next/link";

export default async function OAuthSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { locationId } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          Connected
        </p>
        <h1 className="mt-3 text-xl font-semibold text-foreground">
          This location is linked.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Token stored for location{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground">
            {locationId ?? "unknown"}
          </code>
          . Next up: choosing a calendar feed to import — that piece isn&apos;t
          built yet.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
