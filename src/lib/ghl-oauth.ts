// Helpers for the GoHighLevel Marketplace OAuth 2.0 (Authorization Code) flow.
//
// Reference: https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0
//            https://marketplace.gohighlevel.com/docs/Authorization/TargetUserSubAccount
//
// This app's GHL Marketplace listing should be configured with:
//   - Target User: Sub-Account
//   - Redirect URL: matches GHL_REDIRECT_URI below, exactly
//   - Scopes: calendars.readonly calendars.write calendars/events.readonly calendars/events.write

const AUTHORIZATION_URL = "https://marketplace.leadconnectorhq.com/oauth/chooselocation";
const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

export const REQUIRED_SCOPES = [
  "calendars.readonly",
  "calendars.write",
  "calendars/events.readonly",
  "calendars/events.write",
];

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export class GhlOAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "GhlOAuthError";
  }
}

/** The shape GHL's /oauth/token endpoint returns for a sub-account (Location) token. */
export interface GhlTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userType: "Location" | "Company";
  companyId: string;
  locationId?: string;
  userId?: string;
  refreshTokenId?: string;
  isBulkInstallation?: boolean;
}

/** Builds the URL the user is sent to in order to install/authorize the app for a location. */
export function buildAuthorizationUrl(state?: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getRequiredEnv("GHL_CLIENT_ID"),
    redirect_uri: getRequiredEnv("GHL_REDIRECT_URI"),
    scope: REQUIRED_SCOPES.join(" "),
  });
  if (state) params.set("state", state);
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

async function postToTokenEndpoint(body: Record<string, string>): Promise<GhlTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new GhlOAuthError(
      `GHL token endpoint returned ${res.status}`,
      res.status,
      data
    );
  }

  return data as GhlTokenResponse;
}

/**
 * Exchanges an authorization code (from the OAuth callback) for an access/refresh token pair.
 *
 * We request `user_type=Location` because this app targets Sub-Account installs: when a
 * sub-account user installs directly, GHL returns a Location-level token with `locationId`
 * already populated, so no second hop is needed.
 *
 * If your app also allows Agency-level/bulk installs, the response may come back with
 * `userType: "Company"` and no `locationId` — in that case you'd need to listen for the
 * INSTALL webhook to get the locationId, then call /oauth/locationToken to mint a
 * location-level token. That path isn't implemented yet (see README "Next steps").
 */
export async function exchangeCodeForToken(code: string): Promise<GhlTokenResponse> {
  return postToTokenEndpoint({
    client_id: getRequiredEnv("GHL_CLIENT_ID"),
    client_secret: getRequiredEnv("GHL_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    user_type: "Location",
  });
}

/** Refreshes an access token using a stored refresh token. Call this when a token has expired. */
export async function refreshAccessToken(refreshToken: string): Promise<GhlTokenResponse> {
  return postToTokenEndpoint({
    client_id: getRequiredEnv("GHL_CLIENT_ID"),
    client_secret: getRequiredEnv("GHL_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    user_type: "Location",
  });
}
