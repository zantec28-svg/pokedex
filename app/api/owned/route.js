import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

const sql = neon(process.env.DATABASE_URL);

async function init() {
  await sql`CREATE TABLE IF NOT EXISTS owned (id INT PRIMARY KEY)`;
}

function authorized(req) {
  const pin = process.env.APP_PIN;
  return !pin || req.headers.get("x-pin") === pin;
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "pin" }, { status: 401 });
  await init();
  const rows = await sql`SELECT id FROM owned ORDER BY id`;
  return Response.json({ ids: rows.map((r) => r.id) });
}

// Body : { ids: [1, 2, 3], owned: true | false }
export async function POST(req) {
  if (!authorized(req)) return Response.json({ error: "pin" }, { status: 401 });
  const { ids, owned } = await req.json();
  const clean = [...new Set((ids || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n < 5000);
  if (!clean.length) return Response.json({ ok: true });
  await init();
  if (owned) {
    await sql`INSERT INTO owned (id) SELECT unnest(${clean}::int[]) ON CONFLICT DO NOTHING`;
  } else {
    await sql`DELETE FROM owned WHERE id = ANY(${clean}::int[])`;
  }
  return Response.json({ ok: true });
}
