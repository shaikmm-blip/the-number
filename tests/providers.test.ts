// Provider wiring with MOCKED providers: a fake cookie jar, fictional client ids, and stubbed fetch / Plaid client.
// No network is used, and none of this is evidence that a real Plaid or Intuit sandbox connection works.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => { jar.set(k, v); },
    delete: (k: string) => { jar.delete(k); },
  }),
}));

const ENV = ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_REDIRECT_URI", "QBO_ENV", "PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { jar.clear(); for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } vi.resetModules(); });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); vi.doUnmock("@/lib/plaid"); vi.doUnmock("@/app/api/plaid/sync/sync"); });
const fakeQbo = () => { process.env.QBO_CLIENT_ID = "fictional-client"; process.env.QBO_CLIENT_SECRET = "fictional-secret"; };
const ORIGIN = "http://127.0.0.1:3210";

describe("QuickBooks (Intuit OAuth) routes, mocked", () => {
  it("connect without keys says QuickBooks isn't set up (501), with no redirect", async () => {
    const { GET } = await import("@/app/api/qbo/connect/route");
    const r = await GET(new Request(`${ORIGIN}/api/qbo/connect`));
    expect(r.status).toBe(501);
    expect((await r.json()).error).toMatch(/QuickBooks isn't set up on this site yet/);
    expect(jar.has("qbo_state")).toBe(false);
  });
  it("connect with keys redirects to Intuit's authorization endpoint with a state it remembers", async () => {
    fakeQbo();
    const { GET } = await import("@/app/api/qbo/connect/route");
    const r = await GET(new Request(`${ORIGIN}/api/qbo/connect`));
    expect(r.status).toBe(302);
    const u = new URL(r.headers.get("location")!);
    expect(u.origin + u.pathname).toBe("https://appcenter.intuit.com/connect/oauth2"); // Intuit OpenID discovery: authorization_endpoint
    expect(u.searchParams.get("client_id")).toBe("fictional-client");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(u.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/qbo/callback`);
    expect(u.searchParams.get("state")).toBe(jar.get("qbo_state"));
  });
  it("callback rejects a missing or mismatched state", async () => {
    fakeQbo(); jar.set("qbo_state", "expected");
    const { GET } = await import("@/app/api/qbo/callback/route");
    const r = await GET(new Request(`${ORIGIN}/api/qbo/callback?code=c&realmId=9130&state=other`));
    expect(r.headers.get("location")).toBe(`${ORIGIN}/?qbo=denied`);
    expect(jar.has("qbo_at")).toBe(false);
  });
  it("callback exchanges the code at Intuit's token endpoint and keeps the token server-side", async () => {
    fakeQbo(); jar.set("qbo_state", "s1");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "fictional-access" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/qbo/callback/route");
    const r = await GET(new Request(`${ORIGIN}/api/qbo/callback?code=auth-code&realmId=9130&state=s1`));
    expect(r.headers.get("location")).toBe(`${ORIGIN}/?qbo=connected`);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"); // Intuit OpenID discovery: token_endpoint
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("fictional-client:fictional-secret").toString("base64")}`);
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(jar.get("qbo_at")).toBe("fictional-access");
    expect(jar.get("qbo_realm")).toBe("9130");
    expect(jar.has("qbo_state")).toBe(false);
  });
  it("callback reports an error (not success) when the token call fails or the network is down", async () => {
    fakeQbo();
    for (const impl of [async () => new Response("{}", { status: 400 }), async () => { throw new Error("offline"); }, async () => new Response("{}", { status: 200 })]) {
      jar.clear(); jar.set("qbo_state", "s2"); vi.stubGlobal("fetch", vi.fn(impl)); vi.resetModules();
      const { GET } = await import("@/app/api/qbo/callback/route");
      const r = await GET(new Request(`${ORIGIN}/api/qbo/callback?code=x&realmId=1&state=s2`));
      expect(r.headers.get("location")).toBe(`${ORIGIN}/?qbo=error`);
      expect(jar.has("qbo_at")).toBe(false);
    }
  });
  it("data reads the sandbox Profit & Loss by month and returns monthly totals, labelled as such", async () => {
    jar.set("qbo_at", "fictional-access"); jar.set("qbo_realm", "9130");
    const report = { Columns: { Column: [{ ColTitle: "" }, { ColTitle: "Jan 2026", MetaData: [{ Name: "EndDate", Value: "2026-01-31" }] }, { ColTitle: "Total" }] },
      Rows: { Row: [{ group: "Income", Summary: { ColData: [{ value: "" }, { value: "1200.50" }] } }, { group: "Expenses", Summary: { ColData: [{ value: "" }, { value: "300.25" }] } }] } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(report), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const today = new Date().toISOString().slice(0, 10);
    const { GET } = await import("@/app/api/qbo/data/route");
    const r = await GET(new Request(`${ORIGIN}/api/qbo/data?today=${today}`));
    const u = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(u.origin).toBe("https://sandbox-quickbooks.api.intuit.com"); // sandbox unless QBO_ENV is "production"
    expect(u.pathname).toBe("/v3/company/9130/reports/ProfitAndLoss");
    expect(u.searchParams.get("summarize_column_by")).toBe("Month");
    expect(u.searchParams.get("end_date")).toBe(today);
    const j = await r.json();
    expect(j.txns.map((t: { amountCents: number; source: string; reason: string }) => [t.amountCents, t.source, t.reason])).toEqual([
      [120_050, "QuickBooks", "From your QuickBooks Profit & Loss."], [-30_025, "QuickBooks", "From your QuickBooks Profit & Loss."]]);
  });
  it("data without a connection is 401, and a network failure is a plain 502", async () => {
    const mod = await import("@/app/api/qbo/data/route");
    expect((await mod.GET(new Request(`${ORIGIN}/api/qbo/data`))).status).toBe(401);
    jar.set("qbo_at", "a"); jar.set("qbo_realm", "1"); vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await mod.GET(new Request(`${ORIGIN}/api/qbo/data`));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe("Couldn't reach QuickBooks. Try connecting again.");
  });
});

describe("Plaid routes, mocked", () => {
  it("link-token without keys says bank connections aren't set up (501)", async () => {
    const { POST } = await import("@/app/api/plaid/link-token/route");
    const r = await POST();
    expect(r.status).toBe(501);
    expect((await r.json()).error).toMatch(/Bank connections aren't set up on this site yet/);
  });
  it("link-token asks Plaid for a Transactions link token for the US (mocked client)", async () => {
    const linkTokenCreate = vi.fn(async () => ({ data: { link_token: "link-sandbox-fictional" } }));
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({ linkTokenCreate }) }));
    const { POST } = await import("@/app/api/plaid/link-token/route");
    const j = await (await POST()).json();
    expect(j.link_token).toBe("link-sandbox-fictional");
    const req = (linkTokenCreate.mock.calls[0] as unknown as [{ products: string[]; country_codes: string[]; client_name: string; user: { client_user_id: string } }])[0];
    expect(req.products).toEqual(["transactions"]);
    expect(req.country_codes).toEqual(["US"]);
    expect(req.client_name).toBe("The Number");
    expect(req.user.client_user_id).toMatch(/^the-number-/);
  });
  it("link-token surfaces a Plaid error as 502 with its message", async () => {
    const linkTokenCreate = vi.fn(async () => { throw Object.assign(new Error("x"), { response: { data: { error_message: "invalid client_id or secret provided" } } }); });
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({ linkTokenCreate }) }));
    const { POST } = await import("@/app/api/plaid/link-token/route");
    const r = await POST();
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe("Plaid couldn't start: invalid client_id or secret provided");
  });
  it("exchange requires a public_token, swaps it for an access token kept in an httpOnly cookie, then syncs", async () => {
    const itemPublicTokenExchange = vi.fn(async () => ({ data: { access_token: "access-sandbox-fictional" } }));
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({ itemPublicTokenExchange }) }));
    vi.doMock("@/app/api/plaid/sync/sync", () => ({ syncAll: vi.fn(async () => ({ txns: [], balances: [{ name: "Fictional checking", balanceCents: 100 }] })) }));
    const { POST } = await import("@/app/api/plaid/exchange/route");
    expect((await POST(new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({}) }))).status).toBe(400);
    const r = await POST(new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({ public_token: "public-sandbox-fictional" }) }));
    expect(r.status).toBe(200);
    expect(itemPublicTokenExchange).toHaveBeenCalledWith({ public_token: "public-sandbox-fictional" });
    expect(jar.get("plaid_at")).toBe("access-sandbox-fictional");
    expect((await r.json()).balances[0].name).toBe("Fictional checking");
  });
});

describe("Plaid Link success → exchange → import (mocked Plaid API, real exchange route and syncAll)", () => {
  const fakeClient = (status: string, added: { transaction_id: string; date: string; name: string; amount: number; account_id: string }[]) => ({
    itemPublicTokenExchange: vi.fn(async (_: { public_token: string }) => ({ data: { access_token: "access-sandbox-picked" } })),
    accountsGet: vi.fn(async () => ({ data: { accounts: [{ account_id: "acc1", name: "Plaid Checking", type: "depository", balances: { available: 1234.56, current: 1300 } }] } })),
    transactionsSync: vi.fn(async () => ({ data: { added, next_cursor: "c1", has_more: false, transactions_update_status: status } })),
  });
  const viaRoute = async (POST: (r: Request) => Promise<Response>) => (async (url: string, init?: RequestInit) => POST(new Request(`${ORIGIN}${url}`, init))) as unknown as typeof fetch;
  const rows = [
    { transaction_id: "t1", date: "2026-03-02", name: "Zelle from customer driveway wash", amount: -250, account_id: "acc1" },
    { transaction_id: "t2", date: "2026-03-05", name: "Home Depot supplies", amount: 42.1, account_id: "acc1" },
  ];
  it("imports the account the person picked in Link, labelled as a Plaid Sandbox test bank", async () => {
    const client = fakeClient("HISTORICAL_UPDATE_COMPLETE", rows);
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => client }));
    const { POST } = await import("@/app/api/plaid/exchange/route");
    const { finishPlaidLink } = await import("@/lib/plaidLink");
    const res = await finishPlaidLink("public-sandbox-picked", { institution: "First Platypus Bank", sandbox: true }, await viaRoute(POST));
    expect(client.itemPublicTokenExchange).toHaveBeenCalledWith({ public_token: "public-sandbox-picked" }); // the selected token, not a new sample item
    expect(res.kind).toBe("data");
    if (res.kind !== "data") return;
    expect(res.source).toBe("Plaid Sandbox · First Platypus Bank (test bank, fictional data)");
    expect(res.txns.map((t) => t.id)).toEqual(["plaid-t1", "plaid-t2"]);
    expect(res.txns.every((t) => t.source === "Plaid · Plaid Checking")).toBe(true);
    expect(res.balances).toEqual([{ name: "Plaid Checking", balanceCents: 123_456 }]);
    expect(res.txns.find((t) => t.id === "plaid-t1")!.amountCents).toBe(25_000); // Plaid: positive = money out; stored as money in
  });
  it("an incomplete history is a 'try again', not an estimate on part of the year", async () => {
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({ itemPublicTokenExchange: vi.fn(async () => ({ data: { access_token: "a" } })) }) }));
    vi.doMock("@/app/api/plaid/sync/sync", () => ({ syncAll: vi.fn(async () => ({ txns: [{ id: "plaid-x" }], balances: [], complete: false })) }));
    const { POST } = await import("@/app/api/plaid/exchange/route");
    const { finishPlaidLink } = await import("@/lib/plaidLink");
    const res = await finishPlaidLink("p", { institution: "First Platypus Bank", sandbox: true }, await viaRoute(POST));
    expect(res).toEqual({ kind: "pending", message: "Connected to First Platypus Bank, but Plaid is still loading earlier transactions. Check again in a minute." });
  });
  it("no transactions yet is an honest empty state; a failed exchange shows Plaid's message", async () => {
    const client = fakeClient("HISTORICAL_UPDATE_COMPLETE", []);
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => client }));
    vi.doMock("@/app/api/plaid/sync/sync", () => ({ syncAll: vi.fn(async () => ({ txns: [], balances: [], complete: true })) }));
    let { POST } = await import("@/app/api/plaid/exchange/route");
    const { finishPlaidLink } = await import("@/lib/plaidLink");
    expect((await finishPlaidLink("p", { sandbox: true }, await viaRoute(POST))).kind).toBe("empty");
    vi.resetModules();
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({ itemPublicTokenExchange: vi.fn(async () => { throw Object.assign(new Error("x"), { response: { data: { error_message: "the public token has expired" } } }); }) }) }));
    ({ POST } = await import("@/app/api/plaid/exchange/route"));
    const f2 = await import("@/lib/plaidLink");
    expect(await f2.finishPlaidLink("p", { sandbox: true }, await viaRoute(POST))).toEqual({ kind: "error", message: "Couldn't connect the bank: the public token has expired" });
    expect((await f2.finishPlaidLink("p", { sandbox: true }, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).kind).toBe("error");
  });
});

describe("Check again: the same connected item, no new Link and no second token exchange (mocked)", () => {
  it("pending, then complete through /api/plaid/sync with the item's cookie, keeping the bank and sandbox label", async () => {
    const itemPublicTokenExchange = vi.fn(async () => ({ data: { access_token: "access-sandbox-picked" } }));
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({ itemPublicTokenExchange }) }));
    const txn = { id: "plaid-t1", date: "2026-03-02", source: "Plaid · Plaid Checking", description: "Zelle from customer", amountCents: 25_000, kind: "business_income", reason: "" };
    const syncAll = vi.fn()
      .mockResolvedValueOnce({ txns: [txn], balances: [], complete: false }) // during the exchange: history still loading
      .mockResolvedValueOnce({ txns: [txn], balances: [{ name: "Plaid Checking", balanceCents: 100 }], complete: true }); // on "Check again"
    vi.doMock("@/app/api/plaid/sync/sync", () => ({ syncAll }));
    const exchange = await import("@/app/api/plaid/exchange/route");
    const sync = await import("@/app/api/plaid/sync/route");
    const fetcher = (async (url: string, init?: RequestInit) => {
      const req = new Request(`${ORIGIN}${url}`, init);
      return url === "/api/plaid/exchange" ? exchange.POST(req) : url === "/api/plaid/sync" ? sync.POST() : new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const { finishPlaidLink, retryPlaidSync } = await import("@/lib/plaidLink");
    const ctx = { institution: "First Platypus Bank", sandbox: true };
    expect((await finishPlaidLink("public-sandbox-picked", ctx, fetcher)).kind).toBe("pending");
    const res = await retryPlaidSync(ctx, fetcher);
    expect(itemPublicTokenExchange).toHaveBeenCalledTimes(1); // the public token is never exchanged twice
    expect(syncAll).toHaveBeenCalledTimes(2);
    expect(syncAll.mock.calls.map((c) => c[1])).toEqual(["access-sandbox-picked", "access-sandbox-picked"]); // same item both times
    expect(res).toEqual({ kind: "data", txns: [txn], balances: [{ name: "Plaid Checking", balanceCents: 100 }], source: "Plaid Sandbox · First Platypus Bank (test bank, fictional data)" });
  });
  it("Check again without a connected item says so plainly", async () => {
    vi.doMock("@/lib/plaid", async (orig) => ({ ...(await orig<typeof import("@/lib/plaid")>()), plaidClient: () => ({}) }));
    const sync = await import("@/app/api/plaid/sync/route");
    const { retryPlaidSync } = await import("@/lib/plaidLink");
    const res = await retryPlaidSync({ sandbox: true }, (async () => sync.POST()) as unknown as typeof fetch);
    expect(res).toEqual({ kind: "error", message: "Connect a bank first." });
  });
});
