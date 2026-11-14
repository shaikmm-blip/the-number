"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Loader2, Lightbulb, Lock, ArrowUpRight, Bell, Briefcase, CalendarClock, Download, Eye, EyeOff, GraduationCap, Home as HomeIcon, Copy, Info, Landmark, LogOut, Octagon, Banknote, Printer, ShoppingBag, Terminal, User, Users, Wallet, X, Zap } from "lucide-react";
import { classify } from "@/lib/classify";
import { latestBalance, normalize } from "@/lib/csv";
import { DEMO_FILES, DEMO_PROFILE } from "@/lib/demo";
import { computeNumber, dueIn, localToday, nextProfitTaxCents, periodLeft, type Alert, type Line, type NumberResult } from "@/lib/number";
import { federalEstimate, formatUSD } from "@/lib/tax";
import { randomFactor, scaleBusiness } from "@/lib/scale";
import { ASSUMPTIONS, SOURCES, SOURCE_TITLES, TAX_2026, TAX_YEAR } from "@/lib/taxConfig";
import { ASSUMPTION_LINE, calculationSteps } from "@/lib/steps";
import { buildEstimatePdf, isQuickBooksMonthlyEntry } from "@/lib/pdf";
import { CURRENT_RATE_PCT, PENALTY_SOURCES } from "@/lib/penalty";
import type { Profile, Txn } from "@/lib/types";
import { planById, planLabel } from "@/lib/plans";
import { TYPED_SOURCE, typedTotalsTxns, type TypedTotals } from "@/lib/entry";
import { Connect, Landing, Logo, Pricing, SignUp, ThemeToggle, type Account } from "./Onboarding";

type Tab = "home" | "alerts" | "learn" | "settle" | "profile";
type Stage = "landing" | "signup" | "pricing" | "connect" | "app";
type Why = { title: string; body: string; txns?: Txn[] };

// Plan labels come from lib/plans.ts. No plan chosen (for example the sample on the landing page) shows no plan, never a paid one.
export type AlertPrefs = Record<string, boolean>;
const DEFAULT_PREFS: AlertPrefs = { due: true, late: true, paid: true, weekly: true, locks: true, sms: true, email: false };
const PREFS_KEY = "the-number:alerts";
const KEY = "the-number:account";


export default function App() {
  const [stage, setStage] = useState<Stage>("landing");
  const [account, setAccount] = useState<Account | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [profile, setProfile] = useState<Profile>(DEMO_PROFILE);
  const [source, setSource] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [why, setWhy] = useState<Why | null>(null);
  const [toast, setToast] = useState<Alert | null>(null);
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_PREFS);
  useEffect(() => { try { const v = localStorage.getItem(PREFS_KEY); if (v) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(v) }); } catch { /* fine */ } }, []);
  const setPref = (k: string, v: boolean) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* fine */ } return n; });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [loadFail, setLoadFail] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", business: "Pressure washing" });
  const loadSeq = useRef(0);
  const retryLoad = useRef<() => void>(() => {});
  const txnsRef = useRef<Txn[] | null>(null);
  txnsRef.current = txns;
  const stageRef = useRef<Stage>("landing");
  stageRef.current = stage;
  // Bumped every time data is used (enter). A bank connection started before that belongs to an older visit and is ignored.
  const epoch = useRef(0);
  const plaidFor = (e: number) => (d: { txns: Txn[]; balances: Profile["balances"] }) => { if (e === epoch.current) onPlaid(d); };
  const planFromApp = useRef(false); // pricing was opened from inside the app ("Change plan"), not during setup
  const wantLanding = useRef(false);
  const lastFocus = useRef<HTMLElement | null>(null);

  // Every step is a browser-history entry, so Back (ours or the browser's) moves one step inside the app.
  const go = (next: Stage, replace = false) => {
    planFromApp.current = next === "pricing" && stage === "app";
    const i = (window.history.state?.i ?? 0) + (replace ? 0 : 1);
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, tn: next, i, fromApp: planFromApp.current }, "");
    setStage(next);
  };
  const back = () => { if ((window.history.state?.i ?? 0) > 0) window.history.back(); else go("landing", true); };
  // Home returns to the first entry instead of adding one, so the browser's Back from landing still leaves the site.
  const home = () => { const i = window.history.state?.i ?? 0; if (i > 0) { wantLanding.current = true; window.history.go(-i); } else go("landing", true); };
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, tn: "landing", i: 0 }, "");
    const pop = (e: PopStateEvent) => {
      // Leaving a step cancels a load that is still running there, so it cannot pull the user forward again.
      loadSeq.current++; setBusy((b) => (b === "bank" ? "" : b)); setLoadFail(false);
      let s = (e.state?.tn as Stage) || "landing";
      if (wantLanding.current) { wantLanding.current = false; if (s !== "landing") { window.history.replaceState({ ...window.history.state, tn: "landing" }, ""); s = "landing"; } }
      planFromApp.current = s === "pricing" && !!e.state?.fromApp; // the history entry remembers where pricing was opened from
      setStage(s === "app" && !txnsRef.current ? "landing" : s);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => { try { localStorage.removeItem(KEY); } catch { /* fine */ } }, []);
  // Back from QuickBooks: pull the Profit & Loss and open the dashboard.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("qbo");
    if (!q) return;
    window.history.replaceState({ ...window.history.state, tn: "connect", i: 0 }, "", "/");
    if (q !== "connected") { setError("QuickBooks wasn't connected. Try again."); setStage("connect"); return; }
    setStage("connect"); setBusy("qbo");
    const seq = ++loadSeq.current;
    fetch(`/api/qbo/data?today=${localToday()}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (loadSeq.current !== seq) return; // superseded (e.g. a CSV was used meanwhile)
      const last = (j.txns as Txn[]).reduce((m, t) => (t.date > m ? t.date : m), `${TAX_YEAR}-01-01`);
      setProfile({ ...DEMO_PROFILE, ownerName: "You", businessName: "Your business", age: 0, parentRule: undefined, priorYearTax: undefined, balances: [], bills: [], asOf: localToday() > last ? localToday() : last });
      setTxns(j.txns); enter("QuickBooks (sandbox company), Profit & Loss");
    }).catch((e) => { if (loadSeq.current === seq) setError((e as Error).message); }).finally(() => { if (loadSeq.current === seq) setBusy(""); });
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [stage, tab]);
  // V5: the viewer's calendar date, refreshed at local midnight and whenever the tab comes back, so an open dashboard never shows yesterday's count.
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    let timer = 0;
    const tick = () => { setToday(localToday()); const n = new Date(); timer = window.setTimeout(tick, new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1).getTime() - n.getTime()); };
    const wake = () => setToday(localToday());
    tick(); document.addEventListener("visibilitychange", wake); window.addEventListener("focus", wake);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, []);
  // Sample profiles carry their own answer (DEMO_PROFILE); own data starts unanswered (priorYearTax undefined).
  // The prior-year-tax and paycheck questions were removed (owner, Nov 14). The engine keeps its handling: the sample answers for
  // itself (DEMO_PROFILE), and own data stays unanswered (never assumed "no").
  const result = useMemo(() => (txns ? computeNumber(txns, profile, today) : null), [txns, profile, today]);

  function enter(note: string) { loadSeq.current++; epoch.current++; setBusy(""); setLoadFail(false); setSource(note); setTab("home"); go("app"); }

  async function loadSampleBank(bank = "your bank") {
    // One load at a time. A run that timed out or was retried is stale and must not change the screen.
    const seq = ++loadSeq.current;
    const current = () => loadSeq.current === seq;
    retryLoad.current = () => loadSampleBank(bank);
    const active = document.activeElement as HTMLElement | null;
    if (active && !active.closest("[data-veil]")) lastFocus.current = active;
    setBusy("bank"); setError(""); setLoadFail(false);
    const timer = window.setTimeout(() => { if (current()) { loadSeq.current++; setBusy(""); setLoadFail(true); } }, 8000);
    const f = randomFactor();
    try {
      const r = await fetch("/api/plaid/demo", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (!current()) return;
      // Plaid sometimes hands back only the latest month on a brand-new test item. Need the whole year for an honest tax number.
      const first = (j.txns as Txn[]).reduce((m, t) => (t.date < m ? t.date : m), "9999");
      if ((j.txns as Txn[]).length < 120 || first > `${TAX_YEAR}-02-01`) throw new Error(`Plaid returned ${j.txns.length} transactions, not the full year yet`);
      setProfile({ ...DEMO_PROFILE, asOf: localToday(), balances: j.balances });
      setTxns(scaleBusiness(j.txns, f)); enter(["Venmo", "Cash App", "PayPal", "Stripe"].includes(bank) ? `${bank} Sandbox (sample business)` : `Plaid Sandbox · ${bank} (test connection, sample business)`);
    } catch (e) {
      // Plaid unreachable (Wi-Fi, keys): fall back to the same data from local files so the demo never breaks.
      console.warn("Plaid sample bank unavailable:", (e as Error).message);
      try { await loadFiles("Full-year sample business", f, current); }
      catch (e2) { console.warn("Sample files unavailable:", (e2 as Error).message); if (current()) setLoadFail(true); }
    } finally { window.clearTimeout(timer); if (current()) setBusy(""); }
  }

  async function sampleTxns() {
    const texts = await Promise.all(DEMO_FILES.map((f) => fetch(f).then((r) => { if (!r.ok) throw new Error(`${f} returned ${r.status}`); return r.text(); })));
    return texts.flatMap((t, i) => normalize(t, DEMO_FILES[i])).map(classify);
  }

  async function loadFiles(note?: string, f = randomFactor(), current: () => boolean = () => true) {
    const sample = await sampleTxns();
    if (!current()) return;
    setProfile(DEMO_PROFILE);
    setTxns(scaleBusiness(sample, f));
    enter(note || "Sample statements (Chase + Cash App + Venmo)");
  }

  function onPlaid(data: { txns: Txn[]; balances: Profile["balances"] }) {
    // A bank connection that finishes after the user already moved on (e.g. used a CSV) must not replace their data.
    if (stageRef.current !== "connect") return;
    // Our Plaid Sandbox test user (Jay's business): pair the bank data with Jay's profile (age, bills he entered).
    if (data.balances.some((b) => b.name.startsWith("Jay's Pressure Washing"))) {
      setProfile({ ...DEMO_PROFILE, asOf: localToday(), balances: data.balances });
      setTxns(data.txns); enter("Your bank via Plaid (Sandbox test user)"); return;
    }
    setProfile({ ...DEMO_PROFILE, ownerName: account?.name || "You", businessName: account ? `${account.name}'s ${account.business.toLowerCase()}` : "Your business", age: 0, parentRule: undefined, priorYearTax: undefined, balances: data.balances, bills: [], asOf: localToday() });
    setTxns(data.txns); enter("Your bank via Plaid");
  }

  // "Upload a CSV instead": rows were read and tagged in the browser (lib/upload.ts); count them as this person's own data.
  function onCsv(rows: Txn[]) {
    const today = localToday();
    // Only this tax year's rows set the calculation date; rows from other years don't count and mustn't move it.
    const last = rows.filter((t) => t.date.startsWith(String(TAX_YEAR))).reduce((m, t) => (t.date > m ? t.date : m), `${TAX_YEAR}-01-01`);
    setProfile({ ...DEMO_PROFILE, ownerName: account?.name || "You", businessName: account?.business || "Your business", age: 0, parentRule: undefined, priorYearTax: undefined, balances: [], bills: [], asOf: today > last ? today : last });
    setTxns(rows); enter("Your CSV upload");
  }

  // V7: totals typed in by hand go through the same path, as undated year-to-date rows. Nothing is placed in a period or called late.
  function onTyped(t: TypedTotals) {
    const today = localToday(), lastDay = `${TAX_YEAR}-12-31`;
    setProfile({ ...DEMO_PROFILE, ownerName: account?.name || "You", businessName: account?.business || "Your business", age: 0, parentRule: undefined, priorYearTax: undefined, typedTotals: true, balances: [], bills: [], asOf: today < lastDay ? today : lastDay });
    setTxns(typedTotalsTxns(t, today < lastDay ? today : lastDay)); enter(TYPED_SOURCE);
  }

  function setKind(id: string, kind: "business_income" | "personal" | "business_expense") {
    setTxns((ts) => ts!.map((t) => t.id === id ? { ...t, kind, userSet: true, category: kind === "personal" ? "Personal" : kind === "business_income" ? "Customer payment" : "Business expense", reason: "You told us." } : t));
  }

  function notify(a: Alert) { setToast(a); window.setTimeout(() => setToast(null), 6500); }
  const clock = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  function signOut() { setAccount(null); setTxns(null); setDraft({ name: "", email: "", business: "Pressure washing" }); home(); }

  const veil = busy === "bank" || loadFail ? <LoadVeil failed={loadFail} onRetry={() => retryLoad.current()} onClose={() => { setLoadFail(false); window.setTimeout(() => lastFocus.current?.focus(), 0); }} /> : null;
  // While the veil is up, the page behind it cannot be focused or pressed. (React 18 passes inert through only as a string.)
  const hush: object = veil ? { inert: "" } : {};
  if (stage === "landing") return <><div {...hush}><Landing onStart={() => go("signup")} onSignIn={() => go("signup")} onDemo={() => loadSampleBank()} busy={busy === "bank"} /></div>{veil}</>;
  if (stage === "signup") return <SignUp draft={draft} onDraft={setDraft} onBack={back} onHome={home} onDone={(a) => { setAccount({ ...a, plan: account?.plan }); go("pricing"); }} />;
  // Changing plan from inside the app goes straight back to the number; during setup the next step is still Connect.
  if (stage === "pricing") return <Pricing name={account?.name || "friend"} current={account?.plan} onBack={back} onHome={home} onPick={(plan) => { const toApp = planFromApp.current && !!txns; setAccount({ ...(account || { name: "", email: "", business: "" }), plan }); go(toApp ? "app" : "connect"); }} />;
  if (stage === "connect" || !txns || !result) return <><div {...hush}><Connect onBack={back} onHome={home} onPlaidSandbox={(bank) => loadSampleBank(bank)} onPlaid={plaidFor(epoch.current)} onCsv={onCsv} onTyped={onTyped} busy={busy} error={error} /></div>{veil}</>;

  const byId = new Map(txns.map((t) => [t.id, t]));
  const openLine = (l: Line) => setWhy({ title: l.label, body: l.why, txns: l.txnIds?.map((i) => byId.get(i)!).filter(Boolean).slice(-6) });
  const alertDot = result.alerts.some((a) => a.level !== "info");
  const NAV: [Tab, typeof HomeIcon, string][] = [["home", HomeIcon, "Home"], ["alerts", Bell, "Alerts"], ["settle", Banknote, "Settle"], ["learn", GraduationCap, "Learn"], ["profile", User, "Profile"]];

  return (
    <div className="relative min-h-screen pb-28 sm:pb-10" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[50vh]" style={{ background: "radial-gradient(50% 60% at 50% 0%, rgba(255,255,255,.06), transparent 70%)" }} />
      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 py-4">
        <button className="flex items-center gap-3 text-left" onClick={() => setTab("home")}>
          <Logo size={38} />
          <div>
            <div className="font-display text-[1.05rem] font-medium leading-none tracking-[-0.01em]">The <span className="font-semibold">Number</span></div>
            <div className="muted mt-1 text-xs">Your business · {TAX_YEAR} tax year</div>
          </div>
        </button>
        <nav className="glass hidden items-center gap-1 !rounded-full p-1 sm:flex" aria-label="Main">
          {NAV.map(([k, I, label]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${k === "settle" ? "nav-settle" : tab === k ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}>
              <I size={15} />{label}
              {k === "alerts" && alertDot && <span className="dot absolute right-2 top-1.5 !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          {planById(account?.plan) && <span className="chip hidden text-zinc-300 md:inline-flex">{planById(account?.plan)!.name} plan</span>}
          <button className="btn btn-ghost !p-2.5" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-4">
        {tab === "home" && <Home r={result} openLine={openLine} setWhy={setWhy} txns={txns} go={setTab} source={source} />}
        {tab === "alerts" && <Alerts r={result} go={setTab} prefs={prefs} setPref={setPref} />}
        {tab === "settle" && <Settle r={result} />}
        {tab === "learn" && <Learn r={result} />}
        {tab === "profile" && <Profile r={result} txns={txns} account={account} source={source} plan={planLabel(account?.plan)} onReconnect={() => go("connect")} onEditInfo={() => go("signup")} onChangePlan={() => go("pricing")} onSignOut={signOut} />}
        <p className="muted pb-4 pt-2 text-center text-xs">Data: {source}. Educational estimate, not tax advice.</p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t sm:hidden" style={{ background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }} aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 p-2 text-xs font-medium">
          {NAV.map(([k, I, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`relative flex flex-col items-center gap-1 rounded-xl px-2 py-2 ${k === "settle" ? "nav-settle" : tab === k ? "bg-white/10 text-white" : "text-zinc-400"}`} aria-current={tab === k ? "page" : undefined}>
              <I size={18} />{label}
              {k === "alerts" && alertDot && <span className="dot absolute right-6 top-1.5 !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />}
            </button>
          ))}
        </div>
      </nav>

      {why && <WhySheet {...why} onClose={() => setWhy(null)} />}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="status">
          <div className="toast glass w-full max-w-[420px] !rounded-2xl p-4 shadow-2xl" style={{ background: "rgba(20,20,20,.92)" }}>
            <div className="muted mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"><span className="dot" style={{ background: toast.level === "critical" ? "var(--red)" : "var(--green)" }} />The Number · now</div>
            <div className="font-semibold">{toast.title}</div>
            <div className="muted mt-1 text-sm">{toast.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small pieces ---------- */

// Shown from the moment a load is pressed until the data is in. After about eight seconds, or on failure, it offers a retry.
function LoadVeil({ failed, onRetry, onClose }: { failed: boolean; onRetry: () => void; onClose: () => void }) {
  useEffect(() => { if (!failed) return; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [failed, onClose]);
  return (
    <div data-veil className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role={failed ? "alertdialog" : "status"} aria-modal={failed || undefined} aria-label={failed ? "The sample didn't load" : "Loading the sample business"}>
      <div className="w-full max-w-sm rounded-[28px] border border-zinc-800 bg-[#0b0b0b] p-7 text-center">
        {failed ? (
          <>
            <h2 className="font-display text-xl font-semibold">That didn&apos;t load</h2>
            <p className="mt-2 text-sm text-zinc-300">We couldn&apos;t read the sample data. Check your connection, then try again.</p>
            <button autoFocus className="btn btn-primary mt-5 w-full !rounded-xl" onClick={onRetry}>Try again</button>
            <button className="mt-2 w-full py-2 text-sm text-zinc-300 underline-offset-4 hover:text-white hover:underline" onClick={onClose}>Go back</button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto animate-spin motion-reduce:animate-none" size={28} aria-hidden />
            <h2 className="font-display mt-4 text-xl font-semibold">Loading the sample business…</h2>
            <p className="mt-2 text-sm text-zinc-300">Reading a year of sample transactions and sorting business from personal.</p>
          </>
        )}
      </div>
    </div>
  );
}

function useCountUp(target: number) {
  // Start from 0 (or from the target when motion is reduced) so the first frame never shows the final figure and then resets.
  const [v, setV] = useState(() => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? target : 0));
  const prev = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); prev.current = target; return; }
    const from = prev.current, start = performance.now(), dur = 900;
    let raf = 0;
    const step = (now: number) => { const p = Math.min(1, Math.max(0, (now - start) / dur)); const e = 1 - Math.pow(1 - p, 3); setV(Math.round(from + (target - from) * e)); if (p < 1) raf = requestAnimationFrame(step); else prev.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Label({ children, icon: I }: { children: React.ReactNode; icon?: typeof Eye }) {
  return <div className="muted flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]">{I && <I size={14} />}{children}</div>;
}

/* ---------- Home: one number, two boxes ---------- */

function Home({ r, openLine, setWhy, txns, go, source }: { r: NumberResult; openLine: (l: Line) => void; setWhy: (w: Why) => void; txns: Txn[]; go: (t: Tab) => void; source: string }) {
  const shown = useCountUp(r.owedSoFarCents);
  const usd = (c: number) => formatUSD(c, { cents: true });
  const fmtDate = (iso: string, year = false) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(year ? { year: "numeric" } : {}) });
  const live = r.quarters.find((q) => q.status === "building");
  const owedRows = r.quarters.filter((q) => (q.status === "missed" || q.status === "locked" || q.status === "building") && q.remainingCents > 0);
  const payBy = live?.due ?? r.next.due;
  const profileTyped = source === TYPED_SOURCE; // V7: typed totals carry no dates
  const exempt = r.priorYear === "no"; // V1: no estimated payments required, so nothing is "late"
  const anyLate = !exempt && owedRows.some((q) => q.status === "missed");
  const effRate = r.netProfitCents > 0 ? r.fed.totalTaxCents / r.netProfitCents : 0; // one rate, same basis as the breakdown
  const per100 = Math.round(effRate * 100); // whole dollars of tax per $100 earned
  const taxLines = r.lines.filter((l) => l.key === "se" || l.key === "income" || l.key === "paid");

  // Box 2: a simulated live feed of new money. Every 10 seconds a job comes in (green) or a business cost goes out (red),
  // and the "more you'll owe" counter moves. Nothing else on the page moves.
  type Feed = { id: string; kind: "business_income" | "business_expense"; amountCents: number; description: string; deltaCents: number; time: string };
  const [feed, setFeed] = useState<Feed[]>([]);
  const [flash, setFlash] = useState<"in" | "out" | null>(null);
  const feedRef = useRef<Feed[]>([]);
  const taxFor = (list: Feed[]) => {
    const net = list.reduce((t, e) => t + (e.kind === "business_income" ? e.amountCents : -e.amountCents), 0);
    return Math.round(net * effRate); // same rate we show, so every row reconciles with the headline
  };
  const newTax = taxFor(feed);
  const newTaxShown = useCountUp(newTax);
  useEffect(() => {
    const JOBS = ["House wash", "Driveway wash", "Deck cleaning", "Gutter cleaning", "Window job", "Patio wash", "Fence wash", "Repeat customer"];
    const COSTS = ["Gas for the truck", "Surface cleaner soap", "Pressure washer part", "Facebook ad", "Hose + nozzle", "Truck oil change"];
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    let n = 0;
    const tick = () => {
      const isIn = n++ === 0 || Math.random() < 0.65;
      const amountCents = isIn ? Math.round((90 + Math.random() * 510) * 100) : Math.round((12 + Math.random() * 110) * 100);
      const prev = feedRef.current;
      const base: Omit<Feed, "deltaCents"> = { id: `f-${Date.now()}`, kind: isIn ? "business_income" : "business_expense", amountCents, description: isIn ? pick(JOBS) : pick(COSTS), time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) };
      const next = [...prev, { ...base, deltaCents: 0 }];
      const e: Feed = { ...base, deltaCents: taxFor(next) - taxFor(prev) };
      feedRef.current = [...prev, e];
      setFeed(feedRef.current);
      setFlash(isIn ? "in" : "out"); window.setTimeout(() => setFlash(null), 1200);
    };
    const first = window.setTimeout(tick, 2500);
    const every = window.setInterval(tick, 10_000);
    return () => { window.clearTimeout(first); window.clearInterval(every); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.netProfitCents]);

  return (
    <>
      {/* The one number */}
      <section className="card hero-glow overflow-hidden px-6 py-10 text-center sm:py-14">
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400"><span className="dot" style={{ background: anyLate ? "var(--red)" : "var(--green)" }} />Estimated tax you owe</div>
        <div className="font-display num mt-3 text-[clamp(4rem,13vw,8rem)] font-semibold leading-none tracking-tight">{usd(shown)}</div>
        {r.asOf < r.today && <p className="mt-2 text-xs text-zinc-400">{/sample/i.test(source) ? "Sample data" : "Data"} through {fmtDate(r.asOf, true)}</p>}
        <p className="mx-auto mt-4 max-w-md text-zinc-400">Federal tax on your {TAX_YEAR} business profit as a sole proprietor, minus anything you've already paid.</p>
        {r.paycheckRange && <PaycheckNotice r={r} />}
        <button className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 underline-offset-4 hover:text-white hover:underline" onClick={() => setWhy({ title: `How we estimated ${formatUSD(r.owedSoFarCents)}`, body: taxLines.map((l) => `${l.label}: ${formatUSD(l.amountCents)}. ${l.why}`).join("\n\n") })}>Why this much? <Info size={14} /></button>
      </section>

      {/* Two boxes */}
      {/* grid-cols-1 + min-w-0: a long feed row must not widen the column past the phone screen */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card flex min-w-0 flex-col p-6">
          <div className="flex items-center justify-between gap-2"><Label icon={Lock}>{exempt ? `1 · Due with your ${TAX_YEAR} return` : `1 · Pay by ${fmtDate(payBy)}`}</Label><span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-300">estimated</span></div>
          <div className="font-display num mt-4 text-5xl font-semibold">{usd(r.owedSoFarCents)}</div>
          <div className="mt-1 text-sm text-zinc-400">{exempt ? "Optional early payment by" : "Next due date"} <b className="text-white">{fmtDate(payBy, true)}</b>{exempt && payBy <= r.today ? null : <> · {dueIn(payBy, r.today)}</>}</div>
          <p className="muted mt-2 text-sm">Tax on money you've already earned. New income and costs show up in box 2.</p>
          {profileTyped && <p className="mb-4 mt-2 text-xs text-zinc-400">Your typed totals have no dates, so there&apos;s no quarter-by-quarter view or late check here. That needs a CSV upload or a bank connection.</p>}
          {owedRows.length > 1 && (
            <ul className="mt-3 divide-y text-sm">
              {owedRows.map((q) => (
                <li key={q.quarter} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-zinc-300">{q.status === "building" ? `${q.covers.split(" – ")[0]} – ${r.asOf < r.today ? fmtDate(r.asOf) : "today"}` : q.covers}</span>
                  <span className="flex items-center gap-2"><span className="num font-medium">{usd(q.remainingCents)}</span>{q.status === "missed" && !exempt && <span className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300"><span className="dot !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />late</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {!exempt && !profileTyped && r.penalty.soFarCents > 0 && <p className="muted mb-4 mt-3 text-xs" data-penalty={r.penalty.soFarCents}>Estimated late-payment penalty so far: <b className="text-zinc-300">{usd(r.penalty.soFarCents)}</b>{r.penalty.perWeekCents > 0 && <>, about {usd(r.penalty.perWeekCents)} more each week until the late parts are paid</>}. An illustration on the amounts shown, using the Form 2210 method: each late amount &times; days late &divide; 365 &times; the IRS underpayment rate ({CURRENT_RATE_PCT}% a year now; 6% in Apr&ndash;Jun 2026{r.penalty.assumedRate && "; 7% assumed for 2027, not yet published"}). The IRS figures the actual penalty from each period&apos;s required payment, which can differ. <PenaltySources /></p>}
          {r.priorYear === "unknown" && !profileTyped && <p className="mb-4 mt-2 text-xs text-zinc-400">No estimated-tax penalty applies if last year&apos;s total tax was $0 or you didn&apos;t have to file, the year was a full 12 months, and you were a U.S. citizen or resident all year. (<a className="underline underline-offset-2 hover:text-white" href={PENALTY_SOURCES.exception.url} target="_blank" rel="noreferrer">{PENALTY_SOURCES.exception.title}</a>)</p>}
          {exempt && <p className="muted mb-4 mt-3 text-xs" data-penalty="0">Estimated late-payment penalty: <b className="text-zinc-300">$0.00</b>. You said last year&apos;s total tax was $0, so estimated payments aren&apos;t required this year: this estimate is due with your {TAX_YEAR} return, and paying early is optional. (<a className="underline underline-offset-2 hover:text-white" href={PENALTY_SOURCES.exception.url} target="_blank" rel="noreferrer">{PENALTY_SOURCES.exception.title}</a>)</p>}
          <button className="btn btn-primary w-full" style={{ marginTop: "auto" }} onClick={() => go("settle")}>Settle this now <ArrowRight size={15} /></button>
        </div>

        <div className="card hero-glow flex min-w-0 flex-col p-6">
          <div className="flex items-center justify-between gap-2"><Label icon={CalendarClock}>2 · New income and costs</Label><span className="flex items-center gap-1.5 text-xs text-zinc-400"><span className="dot live-dot" style={{ background: "var(--green)" }} />live</span></div>
          <div className="mt-4 font-display num text-4xl font-semibold transition-colors duration-500" style={{ color: flash === "in" ? "var(--green)" : flash === "out" ? "var(--red)" : undefined }}>{newTaxShown < 0 ? "−" : "+"}{usd(Math.abs(newTaxShown))}</div>
          <div className="mt-1 text-sm text-zinc-400">Estimated extra tax on new income and costs from now{live && periodLeft(live.end, r.today) === "ended" ? null : <> through <b className="text-white">{live ? fmtDate(live.end, true) : fmtDate(payBy, true)}</b>{live && <> &mdash; {periodLeft(live.end, r.today)}</>}</>}.</div>
          <p className="muted mt-2 text-sm">Simple rule: set aside about <b className="text-white">${per100}</b> of every <b className="text-white">$100</b> you make.</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm" aria-live="polite">
            {feed.length === 0 && <li className="muted flex items-center gap-2 text-sm"><span className="dot live-dot" style={{ background: "var(--green)" }} />Waiting for new income and costs…</li>}
            {[...feed].reverse().slice(0, 5).map((x, i) => (
              <li key={x.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${i === 0 ? "rise border-zinc-700" : "border-transparent"}`}>
                <span className="min-w-0 truncate"><span className="muted mr-2 text-xs">{x.time}</span>{x.description}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <b className="num" style={{ color: x.kind === "business_income" ? "var(--green)" : "var(--red)" }}>{x.kind === "business_income" ? "+" : "−"}{usd(x.amountCents)}</b>
                  <span className="num w-24 text-right text-xs text-zinc-400">{x.deltaCents >= 0 ? "+" : "−"}{usd(Math.abs(x.deltaCents))} est. tax</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-400">Simulated: these new income and costs are examples and update every 10 seconds.</p>
        </div>
      </section>

      <Breakdown r={r} source={source} />
    </>
  );
}

/* ---------- Settle: guided one-tap pay ---------- */

const PAY_URL = "https://directpay.irs.gov/directpay/payment";

function Settle({ r }: { r: NumberResult }) {
  const usd = (c: number) => formatUSD(c, { cents: true });
  const live = r.quarters.find((q) => q.status === "building");
  const payBy = live?.due ?? r.next.due;
  const dueStr = new Date(payBy + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const amountFmt = usd(r.owedSoFarCents);
  const [open, setOpen] = useState(false);

  // Open the real IRS Direct Pay page, and walk the user through it step by step in-app.
  const start = () => { try { window.open(PAY_URL, "_blank", "noopener,noreferrer"); } catch { /* fine */ } setOpen(true); };

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="font-display mt-3 text-4xl font-semibold">Settle up</h1>
        <p className="muted mt-1">Pay the IRS without the maze.</p>
        {r.paycheckRange && <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-300" data-paycheck-settle>This estimate leaves out your paycheck, so the income-tax part can be higher: for example about {formatUSD(r.paycheckRange.lowCents)} at {r.paycheckRange.lowPct}% or {formatUSD(r.paycheckRange.highCents)} at {r.paycheckRange.highPct}% instead of {formatUSD(r.fed.incomeTaxCents)}, or more in a higher bracket (see Home).</p>}
        {r.priorYear === "no" && <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-300">You said last year&apos;s total tax was $0, so estimated payments aren&apos;t required this year. This estimate is due with your {TAX_YEAR} return; paying some of it early is optional.</p>}
        <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-zinc-400">This is an estimate from your data &mdash; double-check the amount and your details on the IRS page before you pay. Educational estimate, not tax advice.</p>
      </div>

      <div className="card hero-glow p-7 text-center sm:p-8">
        <div className="muted text-xs font-medium uppercase tracking-[0.14em]">Estimated tax you owe</div>
        <div className="font-display num mt-1 text-6xl font-semibold leading-none">{amountFmt}</div>
        <div className="muted mt-2 text-sm">{r.priorYear === "no" ? `Due with your ${TAX_YEAR} return; paying early is optional` : `Next due date ${dueStr}`}</div>
        {/* The payment CTA: opens the real IRS Direct Pay page (PAY_URL) plus the step-by-step helper. Never clicked in test runs. */}
        <button className="btn btn-settle mt-6 w-full !rounded-xl !py-4 text-base" onClick={start} data-pay-cta>
          Settle <ArrowRight size={16} />
        </button>
        <p className="muted mt-2 text-xs">Opens the real IRS payment page and walks you through it, step by step. We never touch your money.</p>
      </div>

      <div className="text-center">
        <p className="text-[15px] font-semibold">Your estimated number, then the IRS maze in <span className="num">~30 seconds</span>.</p>
        <p className="muted mx-auto mt-1 max-w-sm text-xs leading-relaxed">
          Over half of small-business owners lose <span className="text-zinc-300">40+ hours a year</span> to federal taxes, and about <span className="text-zinc-300">1 in 3</span> aren&apos;t even sure they owe estimated tax. The Number computes it and walks you through paying.
          <br />
          <a className="underline underline-offset-2 hover:text-white" href="https://taxfoundation.org/tax-complexity-expensive-small-businesses" target="_blank" rel="noreferrer">Tax Foundation / NSBA Survey</a>
          <span className="mx-1">&middot;</span>
          <a className="underline underline-offset-2 hover:text-white" href="https://american.edu/media/news/20230418_CarolineBrucknerTaxLiteracySurvey.cfm" target="_blank" rel="noreferrer">Kogod Tax Literacy Survey</a>
        </p>
      </div>

      {open && <PayAssist r={r} amountFmt={amountFmt} year={TAX_YEAR} onClose={() => setOpen(false)} />}
    </section>
  );
}

function PayAssist({ r, amountFmt, year, onClose }: { r: NumberResult; amountFmt: string; year: number; onClose: () => void }) {
  const amountRaw = (r.owedSoFarCents / 100).toFixed(2);
  const fields = [
    // Order as the IRS describes it: reason first, then "Apply payment to" (Direct Pay help; types-of-payments table, checked Nov 12, 2026).
    { label: "Reason for Payment", verb: "Pick the reason in the 1st dropdown", show: "Estimated tax", copy: "Estimated Tax" },
    { label: "Apply Payment To", verb: "Then pick the form", show: "1040-ES", copy: "1040-ES" },
    { label: "Tax Period for Payment", verb: "Pick the year", show: String(year), copy: String(year) },
    { label: "Amount", verb: r.paycheckRange ? "Type or paste this amount — our estimate without your paycheck wages, so it can be too low" : "Type or paste this amount — it's our estimate", show: amountFmt, copy: amountRaw },
  ];
  const TOTAL = fields.length + 1;
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(fields[i].copy); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* fine */ }
  };
  const pct = Math.round((i / (TOTAL - 1)) * 100);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between">
          <div className="muted text-xs font-medium uppercase tracking-[0.12em]">Step {Math.min(i + 1, TOTAL)} of {TOTAL}</div>
          <button className="text-zinc-500 hover:text-white" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-white transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>

        {i < fields.length ? (
          <div className="mt-6">
            <div className="muted text-xs">{fields[i].verb}</div>
            <div className="mt-1 text-sm font-medium text-zinc-300">{fields[i].label}</div>
            <div className="mt-3 rounded-xl border border-white/15 bg-white/[0.05] p-5 text-center">
              <div className="font-display num text-3xl font-semibold">{fields[i].show}</div>
            </div>
            <button className="btn btn-primary mt-4 w-full !rounded-xl !py-3.5" onClick={copy}>
              {copied ? <><Check size={16} />Copied &mdash; paste it in</> : <><Copy size={16} />Copy</>}
            </button>
            <div className="mt-3 flex items-center justify-between">
              <button className="btn btn-ghost !px-3 !py-2 text-xs disabled:opacity-40" onClick={() => setI(i - 1)} disabled={i === 0}>Back</button>
              <button className="btn btn-ghost !px-3 !py-2 text-xs" onClick={() => setI(i + 1)}>Next field <ArrowRight size={14} /></button>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-black"><Check size={22} /></span>
            <h3 className="font-display mt-4 text-xl font-semibold">One step left &mdash; on the IRS page</h3>
            <p className="muted mt-1 text-sm">Enter your bank routing + account number, then hit <b className="text-white">Submit</b>. That pays {amountFmt}, your estimated tax{r.paycheckRange ? " without your paycheck wages; the tax with them can be higher" : ""}.</p>
            <button className="btn btn-primary mt-5 w-full !rounded-xl !py-3.5" onClick={onClose}>Done</button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
          <a className="muted inline-flex items-center gap-1 hover:text-white" href={PAY_URL} target="_blank" rel="noreferrer">IRS page <ArrowUpRight size={12} /></a>
          <details className="text-right">
            <summary className="muted cursor-pointer list-none hover:text-white">Why these?</summary>
            <p className="muted mt-2 max-w-[15rem] text-left text-[11px] leading-relaxed">You&apos;re making a quarterly estimated payment, so it&apos;s Estimated tax &rarr; 1040-ES &rarr; {TAX_YEAR}. The amount is your estimated number &mdash; income minus expenses, run through SE tax, the deduction and your bracket.</p>
          </details>
        </div>
      </div>
    </div>
  );
}

/* ---------- Profile / settings ---------- */

function Profile({ r, txns, account, source, plan, onReconnect, onEditInfo, onChangePlan, onSignOut }: { r: NumberResult; txns: Txn[]; account: Account | null; source: string; plan?: string; onReconnect: () => void; onEditInfo: () => void; onChangePlan: () => void; onSignOut: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const hasMonthlyTotals = txns.some(isQuickBooksMonthlyEntry);
  async function exportPdf() {
    if (exporting) return;
    setExporting(true); setExportError("");
    try {
      // Same steps as the on-screen calculation (lib/steps.ts), so the handoff and the screen cannot disagree.
      const { jsPDF } = await import("jspdf");
      const due = r.quarters?.find((q) => q.status === "building")?.due ?? r.next.due;
      const nextDue = new Date(due + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), r, { name: account?.name, business: account?.business, source, generated: new Date(), nextDue: r.priorYear === "no" ? undefined : nextDue }, txns).save("the-number-itemized-estimate.pdf");
    } catch {
      setExportError("The PDF could not be created. Please try exporting again.");
    } finally { setExporting(false); }
  }
  const rows: [string, string][] = [
    ["Name", account?.name || "You"],
    ["Email", account?.email || "—"],
    ["Business", account?.business || "—"],
    ["Plan", plan || "No plan chosen"],
  ];
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-4xl font-semibold">Profile</h1>

      <div className="card p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-xl font-bold text-black">{(account?.name || "Y").slice(0, 1).toUpperCase()}</span>
          <div><div className="font-display text-xl font-semibold">{account?.name || "You"}</div><div className="muted text-sm">{account?.business || "Your business"}</div></div>
        </div>
        <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b py-2 text-sm"><dt className="muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
        {plan && <p className="mt-3 text-xs text-zinc-400">Choosing a plan doesn&apos;t charge you. This version doesn&apos;t ask for card details or take payments yet.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={onEditInfo}>Edit my info</button>
          <button className="btn btn-ghost" onClick={onChangePlan}>Change plan</button>
          <button className="btn btn-ghost !px-3 text-xs text-zinc-400" onClick={exportPdf} disabled={exporting} aria-busy={exporting} title={hasMonthlyTotals ? "Download your estimate with monthly QuickBooks income and cost totals" : "Download your estimate with itemized income, costs and payments"}><Download size={14} />{exporting ? "Creating PDF..." : "Export PDF"}</button>
        </div>
        <p className="mt-3 text-xs text-zinc-400">{hasMonthlyTotals ? "Includes the tax summary and monthly QuickBooks income and cost totals." : "Includes the tax summary, expense categories and itemized transactions."}</p>
        {exportError && <p className="mt-2 text-sm" role="alert">{exportError}</p>}
      </div>

      <div className="card p-6">
        <h2 className="font-display text-xl font-semibold">Connected account</h2>
        <p className="muted mt-1 text-sm">Where The Number reads your income and business costs.</p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black"><Landmark size={18} /></span>
          <div className="min-w-0 flex-1"><div className="font-medium">Connected</div><div className="muted truncate text-xs">{source}</div></div>
          <span className="dot shrink-0" style={{ background: "var(--green)" }} />
        </div>
        <button className="btn btn-primary mt-4 w-full" onClick={onReconnect}><ArrowUpRight size={16} />Switch bank, Venmo or QuickBooks</button>
        <p className="muted mt-2 text-center text-xs">Takes you back to the connect step. Read-only. We never move money.</p>
      </div>

      <div className="card flex items-center justify-between p-6">
        <div><div className="font-medium">Sign out</div><div className="muted text-sm">Clears this session on this device.</div></div>
        <button className="btn btn-ghost" onClick={onSignOut}><LogOut size={15} />Sign out</button>
      </div>
    </section>
  );
}

/* ---------- Breakdown: how the Number adds up, in plain steps ---------- */

function Breakdown({ r, source }: { r: NumberResult; source: string }) {
  const f = r.fed;
  const usd = (c: number) => formatUSD(c, { cents: true });
  const total = f.se.totalCents + f.incomeTaxCents;
  const per100 = f.netProfitCents > 0 ? (total / f.netProfitCents) * 100 : 0;
  const next100 = nextProfitTaxCents(f.netProfitCents); // V3: what the next $100 of profit adds (engine difference)
  const steps: [string, string, string, number][] = [
    ["1", "You made", "Money in, minus business costs (your profit)", f.netProfitCents],
    ["2", "Self-employment tax", "15.3% on most of your profit. It pays your Social Security and Medicare.", f.se.totalCents],
    ["3", "Income tax", f.incomeTaxCents > 0 ? `The first ${usd(f.netProfitCents - f.taxableIncomeCents)} is tax-free (deductions). The rest is taxed at 10%, then 12%.` : "Your deductions cover all of it, so the estimate here is $0.", f.incomeTaxCents],
  ];
  return (
    <section className="card p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold">How we estimated {usd(r.owedSoFarCents)}</h2>

      {/* The one picture: out of every $100 you made */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3 text-sm"><span>Average so far: out of every <b>$100</b> you made</span><span className="shrink-0"><b className="num">${per100.toFixed(2)}</b> goes to taxes</span></div>
        <div className="mt-2 h-6 overflow-hidden rounded-full border border-white/70 bg-black" role="img" aria-label={`${per100.toFixed(1)} percent of your profit goes to taxes`}>
          <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${Math.min(100, per100)}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-zinc-400"><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-white align-middle" />taxes</span><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full border border-white/70 align-middle" />yours to keep</span></div>
        <p className="mt-3 text-sm" data-next100={next100}>Your next <b>$100</b> of profit adds an estimated <b className="num">{usd(next100)}</b> in tax{next100 > Math.round(per100 * 100) ? ", more than the average" : ""}.</p>
        <p className="mt-1 text-xs text-zinc-400">Federal tax only. State and city taxes are not included.{r.paycheckRange ? " Your paycheck wages are not included either, so the income tax here can be too low." : ""}</p>
      </div>

      {/* Three plain steps */}
      <ol className="mt-8 divide-y">
        {steps.map(([n, title, sub, v]) => (
          <li key={n} className="flex items-center gap-4 py-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/70 text-sm font-semibold">{n}</span>
            <div className="min-w-0 flex-1"><div className="font-medium">{title}</div><div className="muted text-sm">{sub}</div></div>
            <div className="font-display num shrink-0 text-xl font-semibold">{usd(v)}</div>
          </li>
        ))}
        {r.taxPaidCents > 0 && (
          <li className="flex items-center gap-4 py-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/70 text-sm font-semibold">−</span><div className="flex-1 font-medium">Already paid</div><div className="font-display num text-xl font-semibold">−{usd(r.taxPaidCents)}</div></li>
        )}
        <li className="flex items-center gap-4 pt-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-black">=</span>
          <div className="flex-1 font-semibold">Estimated tax you owe</div>
          <div className="font-display num text-2xl font-semibold">{usd(r.owedSoFarCents)}</div>
        </li>
      </ol>

      <details className="group mt-6 rounded-2xl border border-zinc-800 p-4 text-sm" open>
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium">See how it adds up<span className="text-zinc-500 transition group-open:rotate-180">⌄</span></summary>
        <p className="muted mt-3 text-sm">Your number is just two taxes, added together.</p>
        <div className="mt-3 space-y-2.5">
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Self-employment tax</span><span className="font-display num text-lg font-semibold">{usd(f.se.totalCents)}</span></div>
            <p className="muted mt-1 text-xs leading-relaxed">You made {usd(f.netProfitCents)} in profit. This tax takes about <b className="text-zinc-300">14&cent; of every dollar</b>.</p>
          </div>
          <div className="flex justify-center text-lg text-zinc-600">+</div>
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Income tax</span><span className="font-display num text-lg font-semibold">{usd(f.incomeTaxCents)}</span></div>
            <p className="muted mt-1 text-xs leading-relaxed">Your write-offs take {usd(f.netProfitCents - f.taxableIncomeCents)} off the top first. Only the {usd(f.taxableIncomeCents)} left over gets taxed, starting at just <b className="text-zinc-300">10%</b>.</p>
          </div>
          {r.taxPaidCents > 0 && <div className="flex items-center justify-between gap-3 px-1"><span>Already paid to the IRS</span><span className="num">−{usd(r.taxPaidCents)}</span></div>}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-black"><span className="flex items-center gap-1.5 font-semibold"><ArrowRight size={17} strokeWidth={2.75} />Estimated tax you owe</span><span className="font-display num text-xl font-semibold">{usd(r.owedSoFarCents)}</span></div>
        </div>
        <details className="group/full mt-3 border-t border-zinc-800 pt-3 text-xs">
          <summary className="btn btn-ghost w-full cursor-pointer list-none justify-between !rounded-xl !px-4 !py-3 text-sm">Full IRS calculation (for the accountants)<ChevronDown size={16} className="shrink-0 transition group-open/full:rotate-180" aria-hidden /></summary>
          <div className="mt-3 space-y-4 text-zinc-300">
            <div className="space-y-1 text-zinc-400"><p>{ASSUMPTION_LINE}</p><p>Data: {source}.</p></div>
            {calculationSteps(r).map((g) => (
              <div key={g.title}>
                <div className="text-sm font-semibold text-white">{g.title}</div>
                <dl className="mt-1 divide-y divide-zinc-800">
                  {g.steps.map((s) => (
                    <div key={s.id} className="py-2" data-step={s.id} data-cents={s.amountCents}>
                      <div className="flex justify-between gap-3"><dt className={s.kind === "part" ? "" : "font-semibold text-white"}>{s.label}</dt><dd className="num shrink-0">{s.amountCents < 0 ? `−${usd(-s.amountCents)}` : usd(s.amountCents)}</dd></div>
                      <p className="mt-0.5 text-zinc-400">{s.rule}{s.source && <>{" "}<a className="underline underline-offset-2 hover:text-white" href={SOURCES[s.source]} target="_blank" rel="noreferrer">{SOURCE_TITLES[s.source]}</a></>}</p>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </details>
      </details>
    </section>
  );
}

/* ---------- Alerts ---------- */

function Alerts({ r, go, prefs, setPref }: { r: NumberResult; go: (t: Tab) => void; prefs: AlertPrefs; setPref: (k: string, v: boolean) => void }) {
  const color = { critical: "var(--red)", warning: "var(--amber)", info: "#ffffff" };
  const Icon = { critical: Octagon, warning: AlertTriangle, info: Bell };
  const action = (id: string): [string, Tab] | null => id === "review" ? ["How estimated taxes work", "learn"] : id === "missed" || id === "next" || id === "prior" ? ["How estimated taxes work", "learn"] : id === "below" ? ["See my jars", "home"] : id === "rule" ? ["Why it's wrong", "learn"] : null;
  const shown = r.alerts.filter((a) => a.id !== "below" && a.id !== "review");
  const [customs, setCustoms] = useState<{ id: string; text: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { try { const v = localStorage.getItem("the-number:custom-alerts"); if (v) setCustoms(JSON.parse(v)); } catch { /* fine */ } }, []);
  const saveCustoms = (c: { id: string; text: string }[]) => { setCustoms(c); try { localStorage.setItem("the-number:custom-alerts", JSON.stringify(c)); } catch { /* fine */ } };
  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim().slice(0, 80);
    if (!text) return;
    const id = `c-${Date.now()}`;
    saveCustoms([...customs, { id, text }]); setPref(id, true); setDraft(""); setAdding(false);
  };
  const settings: [string, string, string][] = [
    ["due", "An IRS payment is coming up", "14 days and 3 days before each due date, with the amount."],
    ["late", "A payment is late", "Right after a due date passes, with what to pay."],
    ["paid", "A customer pays me", "Shows how much of it you'll owe in tax."],
    ["weekly", "Weekly recap", "Sundays: what you earned and what you owe now."],
    ["locks", "A payment period ends", "When a period ends, with the estimated amount for it."],
    ...customs.map((c) => [c.id, c.text, "Your own alert"] as [string, string, string]),
  ];
  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <h1 className="font-display text-4xl font-semibold">Alerts</h1>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Label>About what you owe</Label>
          {shown.map((a) => {
            const act = action(a.id); const I = Icon[a.level];
            return (
              <div key={a.id} className="card flex gap-4 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-800"><I size={17} style={{ color: color[a.level] }} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><div className="font-semibold">{a.title}</div><div className="muted shrink-0 text-xs">now</div></div>
                  <div className="muted mt-0.5 text-sm">{a.body}</div>
                  {a.id === "missed" && <p className="muted mt-1 text-xs"><PenaltySources /></p>}
                  {a.id === "prior" && <p className="muted mt-1 text-xs">(<a className="underline underline-offset-2 hover:text-white" href={PENALTY_SOURCES.exception.url} target="_blank" rel="noreferrer">{PENALTY_SOURCES.exception.title}</a>)</p>}
                  {act && <button className="mt-2 flex items-center gap-1.5 text-sm font-medium hover:underline" onClick={() => go(act[1])}>{act[0]} <ArrowRight size={14} /></button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-6">
            <h2 className="font-display text-xl font-semibold">Text me when…</h2>
            <p className="muted mt-1 text-sm">Pick the alerts you want. Change them any time.</p>
            <ul className="mt-4 space-y-1">
              {settings.map(([k, t, d]) => (
                <li key={k}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-2.5 hover:bg-white/[0.04]">
                    <input type="checkbox" className="peer sr-only" checked={!!prefs[k]} onChange={(e) => setPref(k, e.target.checked)} />
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-white ${prefs[k] ? "border-white bg-white text-black" : "border-zinc-600"}`}>{prefs[k] && <Check size={14} strokeWidth={3} />}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t}</span><span className="muted block text-xs">{d}</span></span>
                    {k.startsWith("c-") && <button type="button" className="shrink-0 text-zinc-600 hover:text-white" aria-label={`Delete ${t}`} onClick={(e) => { e.preventDefault(); saveCustoms(customs.filter((c) => c.id !== k)); }}><X size={14} /></button>}
                  </label>
                </li>
              ))}
            </ul>
            {adding ? (
              <form onSubmit={addCustom} className="mt-3 flex gap-2">
                <input autoFocus className="input !rounded-full !py-2 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. I owe more than $5,000" maxLength={80} aria-label="Your alert" />
                <button className="btn btn-primary shrink-0 !px-4 !py-2 text-sm">Add</button>
                <button type="button" className="btn btn-ghost shrink-0 !px-3 !py-2" aria-label="Cancel" onClick={() => { setAdding(false); setDraft(""); }}><X size={14} /></button>
              </form>
            ) : (
              <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 py-2.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white" onClick={() => setAdding(true)}>+ Add your own alert</button>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <span className="muted mr-1 self-center text-xs">Send by</span>
              {[["sms", "Text"], ["email", "Email"]].map(([k, l]) => (
                <button key={k} role="switch" aria-checked={!!prefs[k]} onClick={() => setPref(k, !prefs[k])} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${prefs[k] ? "border-white bg-white text-black" : "border-zinc-700 text-zinc-300"}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Money ---------- */

const KIND_LABEL: Record<Txn["kind"], [string, string]> = {
  business_income: ["Business income", "var(--green)"],
  business_expense: ["Business cost", "#a1a1aa"],
  personal: ["Personal", "#52525b"],
  transfer: ["Moved between your accounts", "#52525b"],
  tax_payment: ["Tax payment", "#ffffff"],
  review: ["Needs answer", "var(--amber)"],
};

function TxnRow({ t, children }: { t: Txn; children?: React.ReactNode }) {
  const [label, color] = KIND_LABEL[t.kind];
  const who = t.counterparty && t.counterparty !== t.description ? t.counterparty : "";
  const isIn = t.amountCents > 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{t.description || "(no note)"}{who && <span className="muted text-sm"> · {who}</span>}</div>
        <div className="muted mt-0.5 flex items-center gap-1.5 text-xs">{t.date} · {t.source} · <span className="dot !h-1.5 !w-1.5" style={{ background: color }} />{label}</div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className="text-right"><div className={`num font-semibold ${isIn ? "text-white" : "text-zinc-300"}`}>{formatUSD(Math.abs(t.amountCents), { cents: true })}</div><div className="muted text-[11px]">{isIn ? "money in" : "money out"}</div></div>
      </div>
    </li>
  );
}

/* ---------- Learn ---------- */

const AU = "https://american.edu/media/news/20230418_CarolineBrucknerTaxLiteracySurvey.cfm";
const FB = "https://www.globenewswire.com/news-release/2025/03/19/3045674/0/en/Hidden-Tax-Challenges-for-Small-Businesses-FreshBooks-2025-Tax-Trend-Report.html";
const STATS: { big: string; what: string; means: (r: NumberResult) => string; src: string; url: string }[] = [
  { big: "1 in 3", what: "didn't know whether they had to pay the IRS every quarter.", means: (r) => r.priorYear === "no" ? `Your estimated tax so far is ${formatUSD(r.owedSoFarCents)}; estimated payments aren't required for you this year.` : `Your estimated tax so far is ${formatUSD(r.owedSoFarCents)}; the next due date is ${r.next.due}.`, src: "American University Kogod, Small Business Tax Literacy Survey", url: AU },
  { big: "37%", what: "say filing taxes leaves them anxious and confused.", means: () => "That's why every line of your Number has a plain-English 'why'.", src: "American University Kogod, Small Business Tax Literacy Survey", url: AU },
  { big: "74%", what: "of small business owners and freelancers aren't fully confident about their taxes.", means: () => "Confidence starts with knowing your number before April, not after.", src: "FreshBooks 2025 Tax Trends Report (about 1,300 surveyed; 26% said completely confident)", url: FB },
  { big: "35%", what: "say organizing receipts is their biggest tax headache.", means: (r) => `We sorted ${formatUSD(r.expensesCents)} of your business costs automatically.`, src: "FreshBooks 2025 Tax Trends Report", url: FB },
];

function Learn({ r }: { r: NumberResult }) {
  const months = [3, 2, 3, 4];
  const cards: [string, string, React.ReactNode][] = [
    ["01", "What is The Number?", <>An estimate of how much you owe the IRS for your business this year, after anything you've already paid. One number, worked out from your transactions.</>],
    ["02", "Am I a sole proprietor?", <>If you run a business by yourself and never formed an LLC or corporation, yes, automatically. You and the business are the same for taxes: profit goes on <b>Schedule C</b> of your own return, and nobody takes tax out for you (<a className="underline" href={SOURCES.soleProprietor} target="_blank" rel="noreferrer">IRS</a>).</>],
    ["03", "Self-employment tax (the one nobody tells you about)", <>When you have a job, your boss pays half your Social Security and Medicare. When you work for yourself, you pay both halves: <b>15.3% on 92.35% of your profit</b>. It starts at <b>$400 of profit, at any age</b> (<a className="underline" href={SOURCES.youngEntrepreneurs} target="_blank" rel="noreferrer">IRS</a>). For you, that's an estimated <b>{formatUSD(r.fed.se.totalCents)}</b>.</>],
    ["04", "Why do I owe tax if I'm under the limit?", <>The {formatUSD(TAX_2026.standardDeductionCents)} standard deduction only shields you from <i>income</i> tax. That's why your estimated income tax is {formatUSD(r.fed.incomeTaxCents)}. It doesn't cover self-employment tax at all.{r.paycheckRange ? " With a paycheck, your wages use up that deduction first, so the business's income tax can be higher than shown." : ""}</>],
    ["05", "Paying the IRS during the year", <>Nobody withholds tax from your Cash App, so the IRS expects <b>estimated payments</b> four times a year. Pay at <a className="underline" href="https://www.irs.gov/payments" target="_blank" rel="noreferrer">irs.gov/payments</a>. Paying a required payment late can add a penalty for each day it&apos;s late, at the IRS underpayment rate ({CURRENT_RATE_PCT}% a year now).{r.priorYear !== "no" && r.penalty.soFarCents > 0 ? <> On the amounts here, that&apos;s an estimated <b>{formatUSD(r.penalty.soFarCents, { cents: true })}</b> so far and about {formatUSD(r.penalty.perWeekCents, { cents: true })} more each week{r.penalty.assumedRate ? " (7% assumed for 2027, not yet published)" : ""}; the IRS figures the actual penalty from each period&apos;s required payment.</> : null}{r.priorYear === "no" ? <> You said last year&apos;s total tax was $0, so estimated payments aren&apos;t required for you this year.</> : null} <PenaltySources /></>],
    ["06", "The 20% small-business deduction", <>Sole proprietors can knock up to 20% off their business profit for income tax (the QBI deduction). We include it, so your number isn't inflated (<a className="underline" href={SOURCES.qbi} target="_blank" rel="noreferrer">IRS</a>).</>],
    ["07", "Business vs. personal on payment apps", <>Mixing them makes your profit look bigger (more tax) or smaller (trouble later). Tag every payment, or better, use a separate business profile.</>],
  ];
  return (
    <>
      <h1 className="font-display text-4xl font-semibold">Learn</h1>
      <p className="muted -mt-2 text-sm">30-second explainers using your own numbers.</p>
      <section className="card p-6">
        <h2 className="font-display text-xl font-semibold">You're not the only one confused</h2>
        <p className="muted mt-1 text-sm">What surveys of small business owners and freelancers found, and what it means for you.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((x) => (
            <div key={x.big + x.what} className="flex flex-col rounded-2xl border border-zinc-800 p-5">
              <div className="font-display num text-4xl font-semibold">{x.big}</div>
              <div className="mt-2 text-sm font-medium">{x.what}</div>
              <div className="muted mt-2 text-xs leading-relaxed">{x.means(r)}</div>
              <a href={x.url} target="_blank" rel="noreferrer" className="mt-auto pt-3 text-xs text-zinc-400 underline-offset-2 hover:underline">{x.src}</a>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(([n, title, body]) => (
          <details key={title} className="card group p-6" open={n === "03"}>
            <summary className="flex cursor-pointer list-none items-center gap-4 font-semibold"><span className="font-mono text-xs text-zinc-500">{n}</span>{title}<span className="muted ml-auto text-sm transition group-open:rotate-180">⌄</span></summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{body}</p>
          </details>
        ))}
      </div>
      <section className="card p-6">
        <h2 className="font-display text-xl font-semibold">The IRS “quarters” aren't quarters</h2>
        <p className="muted mt-1 text-sm">They cover 3, then 2, then 3, then 4 months. That trips up anyone with seasonal income, so The Number plans it monthly instead.</p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {TAX_2026.quarterlyDueDates.map((q, i) => {
            const missed = r.missed.some((m) => m.due === q.due), next = r.next.due === q.due;
            return (
              <li key={q.due} className={`rounded-2xl border p-4 ${next ? "border-white bg-white/[0.04]" : "border-zinc-800"}`}>
                <div className="flex justify-between text-xs font-medium"><span className="text-zinc-400">Payment {i + 1}</span><span className="flex items-center gap-1.5">{missed && <span className="dot !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />}{missed ? "Missed" : next ? "Next" : "Later"}</span></div>
                <div className="font-display num mt-1 text-lg font-semibold">{q.due}</div>
                <div className="mt-2 flex gap-1">{Array.from({ length: months[i] }).map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${next ? "bg-white" : missed ? "bg-zinc-500" : "bg-zinc-800"}`} />)}</div>
                <div className="muted mt-1.5 text-xs">{months[i]} months · {q.covers}</div>
              </li>
            );
          })}
        </ol>
      </section>
      <details className="card p-6 text-sm"><summary className="cursor-pointer font-semibold">Assumptions and sources</summary>
        <ul className="muted mt-2 list-disc space-y-1 pl-5">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
        <ul className="mt-2 space-y-1">{Object.entries(SOURCES).map(([k, u]) => <li key={k}><a className="underline" href={u} target="_blank" rel="noreferrer">{SOURCE_TITLES[k as keyof typeof SOURCES]}</a></li>)}</ul>
      </details>
    </>
  );
}

// V2 (fallback): a paycheck is not modeled yet. Say plainly that the income-tax part is higher, with the range from the bracket rates.
function PaycheckNotice({ r }: { r: NumberResult }) {
  const p = r.paycheckRange!;
  return (
    <div className="mx-auto mt-4 max-w-md rounded-2xl border border-zinc-700 p-4 text-left text-sm text-zinc-300" role="note" data-paycheck-notice>
      <b className="text-white">You have a paycheck job, so the income-tax part can be higher than shown.</b> This estimate leaves your wages out and treats the business as your only income. For example, filing single with the standard deduction and wages of {formatUSD(p.wagesFromCents)} or more (enough to use up the {formatUSD(TAX_2026.standardDeductionCents)} standard deduction and the 10% bracket), about {formatUSD(p.taxableCents, { cents: true })} of business income would be taxed at {p.lowPct}% or more: about {formatUSD(p.lowCents, { cents: true })} at {p.lowPct}% or {formatUSD(p.highCents, { cents: true })} at {p.highPct}%, instead of {formatUSD(r.fed.incomeTaxCents, { cents: true })}. In a higher bracket it would be more. An estimate that includes your wages isn&apos;t supported yet.
    </div>
  );
}

// V4: where the penalty method and rates come from.
function PenaltySources() {
  return <>(<a className="underline underline-offset-2 hover:text-white" href={PENALTY_SOURCES.method.url} target="_blank" rel="noreferrer">{PENALTY_SOURCES.method.title}</a>; <a className="underline underline-offset-2 hover:text-white" href={PENALTY_SOURCES.rates.url} target="_blank" rel="noreferrer">{PENALTY_SOURCES.rates.title}</a>)</>;
}

/* ---------- Why sheet ---------- */

function WhySheet({ title, body, txns, onClose, kicker = "Why?", children }: Why & { onClose: () => void; kicker?: string; children?: React.ReactNode }) {
  // Takes focus when it opens, keeps Tab inside, closes on Escape, and hands focus back to whatever opened it.
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // preventScroll: on phones, focusing inside the bottom sheet must not shift the visible area (it pushed the tab bar off screen).
    panel.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close.current();
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>("button, a[href]")];
      const first = f[0], last = f[f.length - 1];
      if (!first) return;
      if (!panel.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); opener?.focus({ preventScroll: true }); };
  }, []);
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div ref={panel} className="toast relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-zinc-800 bg-[#0b0b0b] p-7 sm:m-4 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <button className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-zinc-800 text-zinc-400 hover:text-white" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <Label>{kicker}</Label>
        <h3 className="font-display mt-2 pr-10 text-2xl font-semibold">{title}</h3>
        {body && <p className="mt-3 whitespace-pre-line leading-relaxed text-zinc-300">{body}</p>}
        {children}
        {txns && txns.length > 0 && (<><div className="muted mt-5 text-xs font-medium uppercase tracking-wider">From these transactions (latest)</div><ul className="divide-y">{txns.map((t) => <TxnRow key={t.id} t={t} />)}</ul></>)}
        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
