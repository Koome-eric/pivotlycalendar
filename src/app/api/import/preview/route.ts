import { NextRequest, NextResponse } from "next/server";
import { parseIcsUrl, parseIcsText } from "@/lib/ics-parser";
export const runtime = "nodejs";

/**
 * POST /api/import/preview
 *
 * Parses an ICS source and returns the event list for the user to review
 * before any writes happen.
 *
 * For a URL source:
 *   Content-Type: application/json
 *   Body: { sourceType: "ICS_URL", url: string }
 *
 * For a file upload:
 *   Content-Type: multipart/form-data
 *   Fields: sourceType="ICS_FILE", file=<.ics file>
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");

      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const text = await (file as File).text();
      if (!text.trim().startsWith("BEGIN:VCALENDAR")) {
        return NextResponse.json(
          { error: "File does not appear to be a valid ICS calendar." },
          { status: 422 }
        );
      }

      const result = parseIcsText(text);
      return NextResponse.json(result);
    }

    // JSON body — URL source.
    const body = await request.json().catch(() => null);
    if (!body?.url) {
      return NextResponse.json({ error: "url is required for ICS_URL source" }, { status: 400 });
    }

    const result = await parseIcsUrl(body.url as string);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
