import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeCodeForToken, GhlOAuthError } from "@/lib/ghl-oauth";

/**
 * GHL redirects here after the user installs the app / grants access, e.g.:
 *   GET /api/oauth/callback?code=xxxxx
 *
 * This must exactly match the Redirect URL configured for the app in the
 * GHL Marketplace developer portal (GHL_REDIRECT_URI in .env).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (oauthError) {
    return redirectTo(`/oauth/error?reason=${encodeURIComponent(oauthError)}`);
  }

  if (!code) {
    return redirectTo("/oauth/error?reason=missing_code");
  }

  try {
    const token = await exchangeCodeForToken(code);

    // For now we only support direct sub-account installs, where GHL hands us the
    // locationId straight away. Agency-level/bulk installs need the INSTALL webhook
    // + a /oauth/locationToken hop, which isn't built yet.
    if (token.userType !== "Location" || !token.locationId) {
      console.error("Unsupported OAuth install type", { userType: token.userType });
      return redirectTo("/oauth/error?reason=unsupported_install_type");
    }

    const expiresAt = new Date(Date.now() + token.expires_in * 1000);

    await prisma.location.upsert({
      where: { locationId: token.locationId },
      create: {
        locationId: token.locationId,
        companyId: token.companyId,
      },
      update: {
        companyId: token.companyId,
        isActive: true,
      },
    });

    await prisma.oAuthToken.upsert({
      where: { locationId: token.locationId },
      create: {
        location: { connect: { locationId: token.locationId } },
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        userType: token.userType,
        scope: token.scope,
        expiresAt,
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        userType: token.userType,
        scope: token.scope,
        expiresAt,
      },
    });

    return redirectTo(`/oauth/success?locationId=${encodeURIComponent(token.locationId)}`);
  } catch (err) {
    if (err instanceof GhlOAuthError) {
      console.error("GHL token exchange failed", err.status, err.body);
    } else {
      console.error("OAuth callback failed", err);
    }
    return redirectTo("/oauth/error?reason=token_exchange_failed");
  }
}