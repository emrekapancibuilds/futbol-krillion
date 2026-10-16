import { json } from "@/lib/game/http.ts";
import { MAX_QUERY } from "@/lib/niche.ts";
import { findPlayers, nicheTotal } from "@/lib/niche-server.ts";

export const dynamic = "force-dynamic";

/** Niche-o-meter search: up to 6 players for `?q=`, each with a score. Free for everyone; nothing is stored. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > MAX_QUERY * 2) return json({ error: "That name is too long." }, 400);
  return json({ results: findPlayers(q), total: nicheTotal() });
}
