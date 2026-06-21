import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/connect/agency
 * Body: { locationId: string; apiKey: string; label?: string }
 *
 * Agency API keys are agency-level tokens. They work with GHL's v2 API when
 * a locationId is passed in the query string. We validate by listing calendars
 * for the supplied locationId, then store with connectionType = AGENCY_KEY.
 */
export async function POST(request: NextRequest) {
  let body: { locationId?: string; apiKey?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { locationId, apiKey, label } = body;
  if (!locationId?.trim() || !apiKey?.trim()) {
    return NextResponse.json({ error: "locationId and apiKey are required" }, { status: 400 });
  }

  // Validate by hitting the GHL calendars API with the agency key.
  const validationRes = await fetch(
    `https://services.leadconnectorhq.com/calendars/?locationId=${encodeURIComponent(locationId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    }
  );

  if (!validationRes.ok) {
    const msg =
      validationRes.status === 401
        ? "API key rejected. Check the key in GHL → Settings → Agency → API Keys."
        : `GoHighLevel returned ${validationRes.status}. Verify the location ID is within this agency.`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const locationName = label ?? null;

  await prisma.location.upsert({
    where: { locationId },
    create: { locationId, name: locationName, isActive: true },
    update: { name: locationName ?? undefined, isActive: true },
  });

  await prisma.oAuthToken.upsert({
    where: { locationId },
    create: {
      location: { connect: { locationId } },
      accessToken: apiKey,
      refreshToken: null,
      connectionType: "AGENCY_KEY",
      userType: "Company",
      expiresAt: null,
    },
    update: {
      accessToken: apiKey,
      refreshToken: null,
      connectionType: "AGENCY_KEY",
      userType: "Company",
      expiresAt: null,
    },
  });

  return NextResponse.json({ ok: true, locationId });
}