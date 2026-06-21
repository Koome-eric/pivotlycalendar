import Link from "next/link";

const REASON_MESSAGES: Record<string, string> = {
  missing_code: "GoHighLevel didn't send back an authorization code.",
  token_exchange_failed: "GoHighLevel rejected the token exchange. Check your client ID/secret and redirect URI.",
  unsupported_install_type:
    "This install returned an agency-level token. Agency/bulk installs aren't supported yet — install directly on a sub-account instead.",
  access_denied: "Access was denied during authorization.",
};

export default async function OAuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = (reason && REASON_MESSAGES[reason]) ?? "Something went wrong connecting to GoHighLevel.";

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-danger">
          Connection failed
        </p>
        <h1 className="mt-3 text-xl font-semibold text-foreground">
          Couldn&apos;t connect that location.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
        {reason && (
          <p className="mt-2 font-mono text-xs text-muted">reason: {reason}</p>
        )}
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
