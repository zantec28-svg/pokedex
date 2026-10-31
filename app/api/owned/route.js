import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

const sql = (...args) => neon(process.env.DATABASE_URL)(...args);

let ready;
function init() {
  ready ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS owned_cards (key TEXT PRIMARY KEY)`;
    // Reprise automatique de l'ancienne table (numéros seuls), puis suppression
    const old = await sql`SELECT to_regclass('public.owned') AS t`;
    if (old[0].t) {
      await sql`INSERT INTO owned_cards (key) SELECT id::text FROM owned ON CONFLICT DO NOTHING`;
      await sql`DROP TABLE owned`;
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

function authorized(req) {
  const pin = process.env.APP_PIN;
  return Boolean(pin) && req.headers.get("x-pin") === pin;
}

export async function GET(req) {
  // Lecture ouverte à tous ; canEdit indique si le code fourni est le bon
  await init();
  const rows = await sql`SELECT key FROM owned_cards`;
  return Response.json({ ids: rows.map((r) => r.key), canEdit: authorized(req) });
}

// Body : { ids: ["25", "v10001", "u-b"], owned: true | false }
export async function POST(req) {
  if (!authorized(req)) return Response.json({ error: "pin" }, { status: 401 });
  const { ids, owned } = await req.json();
  const clean = [...new Set((ids || []).map(String))].filter((k) => /^[a-z0-9-]{1,24}$/i.test(k));
  if (!clean.length) return Response.json({ ok: true });
  await init();
  if (owned) {
    await sql`INSERT INTO owned_cards (key) SELECT unnest(${clean}::text[]) ON CONFLICT DO NOTHING`;
  } else {
    await sql`DELETE FROM owned_cards WHERE key = ANY(${clean}::text[])`;
  }
  return Response.json({ ok: true });
}
