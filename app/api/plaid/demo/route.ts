export const maxDuration = 45;
import { cookies } from "next/headers";
import { Products } from "plaid";
import { notConfigured, plaidClient } from "@/lib/plaid";
import config from "@/public/demo/plaid-custom-user.json";
import { syncAll } from "../sync/sync";

// Sandbox only: creates a real Plaid Item for our custom test user (Jay's Pressure Washing)
// through Plaid's API, then pulls its transactions with /transactions/sync — the same code path a real bank uses.
export async function POST() {
  const plaid = plaidClient();
  if (!plaid) return notConfigured();
  if ((process.env.PLAID_ENV || "").trim().toLowerCase() === "production") return Response.json({ error: "The sample bank works in Plaid Sandbox only." }, { status: 403 });
  try {
    const pt = await plaid.sandboxPublicTokenCreate({
      institution_id: "ins_109508", // First Platypus Bank (Plaid test institution)
      initial_products: [Products.Transactions],
      options: { override_username: "user_custom", override_password: JSON.stringify(config), transactions: { days_requested: 730, start_date: "2026-01-01", end_date: new Date().toISOString().slice(0, 10) } },
    });
    const ex = await plaid.itemPublicTokenExchange({ public_token: pt.data.public_token });
    cookies().set("plaid_at", ex.data.access_token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 6 });
    return Response.json(await syncAll(plaid, ex.data.access_token));
  } catch (e) {
    const msg = (e as { response?: { data?: { error_message?: string } } }).response?.data?.error_message || (e as Error).message;
    return Response.json({ error: `Plaid sandbox error: ${msg}` }, { status: 502 });
  }
}
