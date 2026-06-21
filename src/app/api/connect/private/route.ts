import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/connect/private
 * Body: { locationId: string; token: string; label?: string }
 *
 * Validates the token by calling the GHL calendars endpoint, then stores it.
 * Private Integration tokens don't expire on a short schedule — we store them
 * with no expiresAt and connectionType = PRIVATE_INTEGRATION.
 */
export async function POST(request: NextRequest) {
  let body: { locationId?: string; token?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { locationId, token, label } = body;
  if (!locationId?.trim() || !token?.trim()) {
    return NextResponse.json({ error: "locationId and token are required" }, { status: 400 });
  }

  // Validate the token by hitting the GHL API.
  const validationRes = await fetch(
    `https://services.leadconnectorhq.com/calendars/?locationId=${encodeURIComponent(locationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    }
  );

  if (!validationRes.ok) {
    const msg =
      validationRes.status === 401
        ? "Token was rejected by GoHighLevel. Double-check the token and location ID."
        : `GoHighLevel returned ${validationRes.status}. Verify the location ID and try again.`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Try to pull the location name from the response.
  let locationName: string | null = label ?? null;
  try {
    const json = await validationRes.json();
    // The /calendars response doesn't include a location name — that's fine, we'll use
    // the label the user typed, or fall back to the locationId.
    if (!locationName && json?.location?.name) locationName = json.location.name;
  } catch {
    // ignore
  }

  await prisma.location.upsert({
    where: { locationId },
    create: { locationId, name: locationName, isActive: true },
    update: { name: locationName ?? undefined, isActive: true },
  });

  await prisma.oAuthToken.upsert({
    where: { locationId },
    create: {
      location: { connect: { locationId } },
      accessToken: token,
      refreshToken: null,
      connectionType: "PRIVATE_INTEGRATION",
      userType: "Location",
      expiresAt: null,
    },
    update: {
      accessToken: token,
      refreshToken: null,
      connectionType: "PRIVATE_INTEGRATION",
      userType: "Location",
      expiresAt: null,
    },
  });

  return NextResponse.json({ ok: true, locationId });
}