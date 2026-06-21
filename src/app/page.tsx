import Link from "next/link";

function BlockMark() {
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" fill="none" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect
          key={i}
          x={i * 10 + 1}
          y="1"
          width="8"
          height="22"
          rx="2"
          fill={i === 3 ? "var(--accent)" : "var(--surface)"}
          stroke="var(--border)"
        />
      ))}
    </svg>
  );
}

interface ConnectOptionProps {
  badge: string;
  title: string;
  description: string;
  href?: string;
  hrefExternal?: boolean;
  hint: string;
  disabled?: boolean;
}

function ConnectOption({ badge, title, description, href, hrefExternal, hint, disabled }: ConnectOptionProps) {
  const linkProps = hrefExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <div
      className={`relative rounded-xl border border-border bg-surface p-5 flex flex-col gap-3 ${
        disabled ? "overflow-hidden" : ""
      }`}
    >
      <div className={disabled ? "pointer-events-none blur-[3px] select-none" : ""}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-block rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted uppercase tracking-widest">
              {badge}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
          </div>
        </div>
        <div className="mt-3">
          {href ? (
            <Link
              href={href}
              {...linkProps}
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:opacity-90 transition"
            >
              Connect →
            </Link>
          ) : (
            <span className="inline-block rounded-lg border border-border px-4 py-2 text-xs text-muted">
              Coming soon
            </span>
          )}
          <p className="mt-2 text-[11px] text-muted">{hint}</p>
        </div>
      </div>

      {disabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/30">
          <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-muted shadow-sm">
            Coming soon
          </span>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <BlockMark />
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            GHL Calendar Import
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Block time in GoHighLevel from any calendar.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Import events from any .ics feed — Google Calendar, Airbnb, Outlook, Calendly — and
          they automatically appear as blocked slots in GoHighLevel, preventing double-bookings.
        </p>

        <h2 className="mt-10 text-xs font-medium uppercase tracking-widest text-muted">
          Connect a location
        </h2>
        <div className="mt-3 space-y-3">
          <ConnectOption
            badge="Recommended"
            title="Private Integration Token"
            description="Use a permanent token from a single sub-account's integration settings. No Marketplace listing required — the fastest way to connect today."
            href="/connect/private"
            hint="Settings → Integrations → Private Integrations → Add. Scope: calendars."
          />
          <ConnectOption
            badge="Agency"
            title="Agency API Key"
            description="Use your agency-level API key to connect any sub-account within your agency."
            href="/connect/agency"
            hint="Settings → Agency → API Keys. You'll also need the sub-account's Location ID."
          />
          <ConnectOption
            badge="Marketplace"
            title="GoHighLevel Marketplace OAuth"
            description="Install through the GHL Marketplace. Best for distributing to other agencies or sub-accounts."
            hint="Not yet available — use Private Integration in the meantime."
            disabled
          />
        </div>

        <p className="mt-8 font-mono text-xs text-muted">
          All methods store a token locally and use the same GHL Calendar API under the hood.
        </p>
      </div>
    </main>
  );
}
