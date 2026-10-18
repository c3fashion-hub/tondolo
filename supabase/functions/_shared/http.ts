// CORS and JSON replies for the app's own functions. Only the app's origins may call them.
const ORIGINS = (Deno.env.get("APP_ORIGINS") ?? "https://tondolo.app").split(",").map((o) => o.trim());

export function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export const reply = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// Turns a refused claim_ai_use into a code and status the app understands.
export function claimRefusal(message: string): { code: string; status: number } {
  for (const [code, status] of [["ai_limit", 429], ["locked", 402], ["not_allowed", 403]] as const) {
    if (message.includes(code)) return { code, status };
  }
  return { code: "server", status: 500 };
}

// Today's date where the couple live.
export const todayIn = (timeZone = "Europe/London") =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
