import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GoHighLevel Marketplace webhook receiver.
 *
 * Subscribe to this URL in the GHL Marketplace developer portal under
 * Advanced Settings → Webhooks.
 *
 * Events currently handled:
 *   INSTALL   — Agency-level bulk install: stores the location and marks it active.
 *               The actual OAuth token is NOT available here; it arrives via the
 *               OAuth callback. This handler is used when an agency installs the
 *               app across multiple locations at once (isBulkInstallation = true).
 *   UNINSTALL — Marks the location inactive so we stop syncing it.
 *
 * GHL does not sign these webhook payloads by default. If you need request
 * verification, add a shared secret check here.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, locationId, companyId } = body as {
    type?: string;
    locationId?: string;
    companyId?: string;
  };

  if (!type || !locationId) {
    return NextResponse.json({ error: "Missing type or locationId" }, { status: 400 });
  }

  console.log(`[GHL webhook] type=${type} locationId=${locationId}`);

  switch (type) {
    case "INSTALL": {
      // Upsert the location so we have a record of it.
      // The OAuth token will arrive separately via /api/oauth/callback.
      await prisma.location.upsert({
        where: { locationId },
        create: {
          locationId,
          companyId: companyId ?? null,
          isActive: true,
        },
        update: {
          companyId: companyId ?? undefined,
          isActive: true,
        },
      });
      break;
    }

    case "UNINSTALL": {
      // Deactivate — don't delete, we want to keep the audit trail.
      await prisma.location
        .update({
          where: { locationId },
          data: { isActive: false },
        })
        .catch(() => {
          // Location may not exist yet if somehow UNINSTALL fires before INSTALL.
          console.warn(`[GHL webhook] UNINSTALL for unknown location ${locationId}`);
        });
      break;
    }

    default: {
      // Silently acknowledge unknown events — GHL may send new types in the future.
      console.log(`[GHL webhook] Unhandled event type: ${type}`);
    }
  }

  return NextResponse.json({ received: true });
}
