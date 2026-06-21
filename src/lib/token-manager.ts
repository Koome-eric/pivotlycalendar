import { prisma } from "@/lib/db";
import { refreshAccessToken, GhlOAuthError } from "@/lib/ghl-oauth";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Returns a valid GHL access token for the given locationId.
 *
 * - OAUTH tokens: refreshed automatically when near expiry.
 * - PRIVATE_INTEGRATION / AGENCY_KEY tokens: returned as-is (they don't expire
 *   on a short schedule, or expiry is managed externally).
 */
export async function getValidAccessToken(locationId: string): Promise<string> {
  const record = await prisma.oAuthToken.findUnique({ where: { locationId } });

  if (!record) throw new Error(`No token found for location ${locationId}`);

  // Non-OAuth tokens: just return what we have.
  if (record.connectionType !== "OAUTH") return record.accessToken;

  // OAuth: check expiry and refresh if needed.
  const expiry = record.expiresAt?.getTime() ?? 0;
  if (expiry - Date.now() >= TOKEN_EXPIRY_BUFFER_MS) return record.accessToken;

  if (!record.refreshToken) throw new Error(`OAuth token expired for ${locationId} but no refresh token stored.`);

  try {
    const refreshed = await refreshAccessToken(record.refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await prisma.oAuthToken.update({
      where: { locationId },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        scope: refreshed.scope,
        expiresAt,
      },
    });

    return refreshed.access_token;
  } catch (err) {
    if (err instanceof GhlOAuthError && (err.status === 401 || err.status === 400)) {
      await prisma.location.update({ where: { locationId }, data: { isActive: false } });
      throw new Error(`Location ${locationId} needs re-authorization.`);
    }
    throw err;
  }
}
