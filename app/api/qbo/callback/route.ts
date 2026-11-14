import { cookies } from "next/headers";
import { QBO_TOKEN, qboConfig, qboNotConfigured } from "@/lib/qbo";

// Step 2: Intuit sends the user back with a code. Swap it for an access token, kept server-side in an httpOnly cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cfg = qboConfig(url.origin);
  if (!cfg) return qboNotConfigured();
  const back = (q: string) => Response.redirect(`${url.origin}/?qbo=${q}`, 302);
  const code = url.searchParams.get("code"), realm = url.searchParams.get("realmId"), state = url.searchParams.get("state");
  if (!code || !realm || !state || state !== cookies().get("qbo_state")?.value) return back("denied");
  let t: { access_token?: string };
  try {
    const r = await fetch(QBO_TOKEN, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.id}:${cfg.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirect }),
    });
    if (!r.ok) return back("error");
    t = await r.json();
  } catch { return back("error"); } // network failure or unreadable reply
  if (!t.access_token) return back("error");
  cookies().set("qbo_at", t.access_token as string, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 });
  cookies().set("qbo_realm", realm, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 });
  cookies().delete("qbo_state");
  return back("connected");
}
