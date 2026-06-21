# GHL Calendar Import — Marketplace App

A GoHighLevel Marketplace app that lets sub-accounts import external calendar events
(from `.ics` files or calendar URLs) into GHL as **blocked slots**, preventing
double-bookings without creating fake contacts or appointments.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Database ORM | Prisma + PostgreSQL |
| Background jobs | BullMQ + Redis *(Phase 3)* |
| ICS parsing | node-ical + rrule *(Phase 3)* |
| Hosting | Any Node.js host (Vercel, Railway, Render, …) |

---

## What's built so far

### Phase 1 — GHL OAuth install flow ✅

| File | What it does |
|---|---|
| `src/lib/ghl-oauth.ts` | Builds the authorization URL, exchanges codes for tokens, refreshes tokens |
| `src/lib/token-manager.ts` | `getValidAccessToken(locationId)` — returns a live token, auto-refreshes if near expiry |
| `src/lib/ghl-client.ts` | Typed GHL API wrapper (`listCalendars`, `createCalendar`, `createBlockSlot`, `deleteBlockSlot`) |
| `src/lib/db.ts` | Prisma client singleton |
| `src/app/api/oauth/callback/route.ts` | OAuth callback — exchanges code, upserts Location + OAuthToken |
| `src/app/api/webhooks/ghl/route.ts` | Handles `INSTALL` / `UNINSTALL` webhook events from GHL |
| `src/app/page.tsx` | Homepage with "Connect a GoHighLevel location" button |
| `src/app/oauth/success/page.tsx` | Post-install confirmation page |
| `src/app/oauth/error/page.tsx` | OAuth error page with human-readable reasons |
| `prisma/schema.prisma` | Full DB schema — all 6 tables from the proposal |

### Phases 2 & 3 — Not yet built

- ICS parsing, recurring event expansion (`rrule`), timezone normalisation
- Import wizard UI (URL/file input → event preview → confirm)
- Event writing engine (deduplication + conflict handling + GHL block-slot creation)
- Sync engine (BullMQ scheduled jobs, add/update/delete diffing)
- Admin sync history & retry UI

---

## Local setup

### 1. Clone and install

```bash
git clone <your-repo>
cd ghl-calendar-app
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ghl_calendar"

# From GHL Marketplace developer portal → My Apps → your app → Client Keys
GHL_CLIENT_ID="your-client-id"
GHL_CLIENT_SECRET="your-client-secret"

# Must exactly match what's in the GHL app settings
GHL_REDIRECT_URI="https://your-tunnel.ngrok.app/api/oauth/callback"
```

### 3. Set up the database

```bash
npx prisma generate        # generates the Prisma client
npx prisma migrate dev     # applies all migrations to your local DB
```

### 4. Run the dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

> **GHL requires a publicly reachable URL** for both the OAuth redirect and webhooks.
> Use [ngrok](https://ngrok.com) or [cloudflared](https://developers.cloudflare.com/cloudflared/) during local development:
>
> ```bash
> ngrok http 3000
> # Copy the https URL and set it as GHL_REDIRECT_URI in .env.local
> ```

---

## GHL Marketplace configuration

In your app listing (developer portal → My Apps):

| Setting | Value |
|---|---|
| App Type | Private (while building), Public (when ready) |
| Target User | Sub-Account |
| Who can install | Everyone |
| Redirect URL | `https://yourapp.com/api/oauth/callback` |
| Webhook URL | `https://yourapp.com/api/webhooks/ghl` |
| Scopes | `calendars.readonly` `calendars.write` `calendars/events.readonly` `calendars/events.write` |

---

## OAuth flow — how it works

```
User clicks "Connect a GoHighLevel location"
         │
         ▼
/oauth/chooselocation  (GHL's hosted page)
         │  user picks a sub-account and approves
         ▼
/api/oauth/callback?code=xxxxx
         │
         ├─ POST /oauth/token  →  access_token + refresh_token
         ├─ upsert Location record
         ├─ upsert OAuthToken record
         │
         ▼
/oauth/success
```

Token refresh is handled transparently by `getValidAccessToken()` — every API call
goes through this helper, so you never need to think about expiry elsewhere.

---

## Database schema

```
locations
  └── oauth_tokens        (1-to-1)
  └── calendar_sources    (1-to-many)
        └── import_jobs   (1-to-many)
              └── sync_logs
        └── imported_events
```

Key design decisions:

- **`imported_events` has a `@@unique` on `[calendarSourceId, externalUid, startTime, endTime]`** — this is the deduplication guard. A re-import just hits a unique constraint violation (or `upsert`) rather than creating a duplicate block.
- **`isActive` on `Location`** — flipped to `false` on UNINSTALL or when a refresh token is rejected. Use this to skip locations in sync jobs.

---

## Next steps (Phase 2)

```bash
npm install node-ical rrule date-fns
```

Then build:

1. `src/lib/ics-parser.ts` — parse ICS file/URL → normalised event array (handle `RRULE`, `EXDATE`, timezone offsets)
2. `src/app/api/import/preview/route.ts` — POST with URL or file, return parsed events (no write yet)
3. `src/app/import/page.tsx` — import wizard (source input → preview table → confirm)
4. `src/app/api/import/confirm/route.ts` — write block slots to GHL, track in `imported_events`
