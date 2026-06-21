import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// The Prisma CLI does NOT auto-load .env.local the way Next.js does — it only
// auto-loads a plain `.env` file. Since this project keeps secrets in
// .env.local, we load it explicitly here (no dotenv dependency needed) so
// `prisma migrate dev/deploy` can see DATABASE_URL.
function loadEnvLocal() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(`[prisma.config.ts] .env.local not found at ${envPath}`);
    return;
  }
  const contents = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

// Prisma 7: the connection URL moves out of schema.prisma and into this file.
// - `datasource.url`  → used by the schema engine for `prisma migrate dev/deploy`
// - `new PrismaPg(url)` in src/lib/db.ts → used by PrismaClient at runtime
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});