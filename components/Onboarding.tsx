"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Moon, Sun, Landmark, Lock, ShieldCheck, Timer, User } from "lucide-react";
import type { Kind, Profile, Txn } from "@/lib/types";
import { MAX_FILE_BYTES, readUploads, type UploadPreview } from "@/lib/upload";
import { parseTypedAmount, type TypedTotals } from "@/lib/entry";
import { PLANS, dollars, fullPriceCents, perMonthCents, periodCents } from "@/lib/plans";
import { TAX_YEAR } from "@/lib/taxConfig";
import { PlaidButton } from "./PlaidButton";

export function Logo({ size = 40 }: { size?: number }) {
  // Engraved, slanted pound sign on a black tile with a fine metallic edge.
  const id = `lg-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".9" /><stop offset=".45" stopColor="#ffffff" stopOpacity=".15" /><stop offset="1" stopColor="#ffffff" stopOpacity=".55" /></linearGradient>
        <linearGradient id={`${id}-ink`} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="38"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#a1a1aa" /></linearGradient>
        <radialGradient id={`${id}-glow`} cx=".3" cy=".2" r=".9"><stop offset="0" stopColor="#2a2a2e" /><stop offset="1" stopColor="#050505" /></radialGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${id}-glow)`} stroke={`url(#${id}-edge)`} strokeWidth="1.2" />
      <g stroke={`url(#${id}-ink)`} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M20.5 12.5 L16.5 35.5" />
        <path d="M31.5 12.5 L27.5 35.5" />
        <path d="M13 19.5 H36" />
        <path d="M11.5 28.5 H34.5" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      <Logo size={size} />
      <span className="font-display text-[1.05rem] font-medium tracking-[-0.01em]">The <span className="font-semibold">Number</span></span>
    </span>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.dataset.theme === "light"); }, []);
  const flip = () => {
    const next = !light; setLight(next);
    document.documentElement.dataset.theme = next ? "light" : "dark";
    try { localStorage.setItem("the-number:theme", next ? "light" : "dark"); } catch { /* fine */ }
  };
  return (
    <button onClick={flip} className="btn btn-ghost !p-2.5" aria-label={light ? "Switch to dark mode" : "Switch to light mode"} title={light ? "Dark mode" : "Light mode"}>
      {light ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

const pad = { paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" };

/* ---------------- Landing ---------------- */

export function Landing({ onStart, onDemo, onSignIn, busy }: { onStart: () => void; onDemo: () => void; onSignIn: () => void; busy?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-black">
      <MoneyBackdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between py-5" style={pad}>
        <Wordmark size={36} />
        <div className="flex items-center gap-3"><ThemeToggle /><button className="text-sm font-medium text-zinc-300 hover:text-white" onClick={onSignIn}>Sign in</button></div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 pb-8 text-center">
        <span className="chip rise mb-4 uppercase tracking-[0.14em] text-zinc-300">For first-time business owners</span>
        <h1 className="headline font-display rise text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[1]" style={{ textWrap: "balance" as never }}>Know how much <span className="headline-accent">you owe.</span></h1>
        <p className="rise mt-4 max-w-2xl text-[clamp(1.15rem,2.4vw,1.55rem)] font-medium leading-snug text-white" style={{ textWrap: "balance" as never }}>
          See an estimate of what you owe the IRS, and when it&apos;s due. Built for first-time business owners.
        </p>
        <div className="rise mt-6 w-full max-w-2xl rounded-[28px] border border-white/15 bg-[#0c0c0c]/90 px-6 py-5 backdrop-blur sm:px-8">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6 sm:text-left">
            <div className="font-display num shrink-0 text-[clamp(3.5rem,9vw,5.5rem)] font-semibold leading-none">15.7M</div>
            <div>
              <div className="text-lg font-semibold leading-snug">IRS estimated-tax penalties assessed in fiscal 2025.</div>
              <div className="muted mt-1 text-sm">Americans filed about <b className="text-white">4.9 million</b> new business applications in Jan–Sep 2026, and in one survey about <b className="text-white">1 in 3</b> small businesses and gig workers didn&apos;t know if they had to pay estimated tax.</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400 sm:text-left">
            <a className="underline-offset-2 hover:underline" href="https://www.irs.gov/statistics/collections-activities-penalties-and-appeals" target="_blank" rel="noreferrer" title="Table 4-2: estimated tax penalties assessed on individual, estate and trust income tax returns, fiscal year 2025">IRS Data Book FY2025, Table 4-2 (individual, estate and trust returns)</a>
            <a className="underline-offset-2 hover:underline" href="https://sbecouncil.org/2026/10/31/americas-entrepreneurship-surge-continues-nearly-5-million-business-applications-filed-through-september/" target="_blank" rel="noreferrer" title="SBE Council, from U.S. Census Business Formation Statistics, January–September 2026">SBE Council (Census data)</a>
            <a className="underline-offset-2 hover:underline" href="https://american.edu/media/news/20230418_CarolineBrucknerTaxLiteracySurvey.cfm" target="_blank" rel="noreferrer">American University Kogod, Small Business Tax Literacy Survey</a>
          </div>
        </div>
        {/* L2: the horizon hangs from this group, so its line always runs through the gap between the stat card and the button,
            whatever the screen size. Not animated itself, so the arc stays behind the card (see .horizon). */}
        <div className="relative mt-7 sm:mt-[52px]">
          {/* Hidden on phones: there the call to action and its small print land right on the glow and can't be read. */}
          <div className="horizon pointer-events-none hidden sm:block" aria-hidden />
          <div className="rise flex flex-col items-center gap-3">
            <button className="btn btn-primary btn-halo min-w-[220px] !rounded-xl !py-3.5 text-base" onClick={onStart}>Get Started <ArrowRight size={16} /></button>
            <span className="text-xs text-zinc-400">Connects with your bank through Plaid, and with QuickBooks</span>
            <button className="inline-flex items-center gap-2 text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline" onClick={onDemo} disabled={busy} aria-busy={busy || undefined}>{busy ? <><Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />Loading a live example…</> : "or see a live example first"}</button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------------- Money-flow backdrop (original, animated) ---------------- */

export function MoneyBackdrop({ showFlow = true }: { showFlow?: boolean }) {
  // Money comes in from the left (bank, Cash App, card, P2P), flows green into the # hub,
  // which sends a red slice to the IRS on the right. The centre column is dimmed so page text
  // stays readable; the flow lives in the margins. The drawing is scaled to fit the screen
  // ("meet"), so nothing is cut off at an edge, and it is left out below laptop width.
  const HUB_X = 1080, HUB_Y = 384;
  const nodes: [number, number, string][] = [
    [110, 140, "bank"], [70, 330, "cash"], [130, 560, "card"], [170, 236, "dot"], [150, 450, "pay"],
  ];
  const S = nodes.map(([x, y]) => `M${x + 20},${y} C${(x + HUB_X) / 2 + 40},${y} ${(x + HUB_X) / 2 - 10},${HUB_Y} ${HUB_X - 10},${HUB_Y + (y - 330) * 0.06}`);
  const HUB_IRS = `M${HUB_X + 54},${HUB_Y + 18} C${HUB_X + 90},${HUB_Y + 40} ${HUB_X + 110},${HUB_Y + 80} ${HUB_X + 103},${HUB_Y + 120}`;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <style>{`
        @keyframes mbDash{to{stroke-dashoffset:-22}}
        .mb-dash{stroke-dasharray:2 7;animation:mbDash 1.8s linear infinite}
        .mb-float{animation:mbFloat 7s ease-in-out infinite}
        @keyframes mbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes mbPulse{0%,100%{opacity:.45}50%{opacity:1}}
        .mb-pulse{animation:mbPulse 2.6s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.mb-dash,.mb-float,.mb-pulse{animation:none}.mb-pkt{display:none}}
      `}</style>
      {/* diagonal hatch + green (money in) / red (owed) corner glows */}
      <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 1px, transparent 1px 11px)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 55% at 6% 2%, color-mix(in srgb, var(--green) 20%, transparent), transparent 70%), radial-gradient(60% 55% at 100% 104%, color-mix(in srgb, var(--red) 17%, transparent), transparent 70%)" }} />
      {showFlow && <svg className="absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 1240 760" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* dim a vertical column down the middle, where page text sits */}
          <linearGradient id="mb-col" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset=".3" stopColor="#fff" stopOpacity=".92" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".12" /><stop offset=".7" stopColor="#fff" stopOpacity=".92" /><stop offset="1" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="mb-mask"><rect width="1240" height="760" fill="url(#mb-col)" /></mask>
          <radialGradient id="mb-hub" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="rgba(255,255,255,.12)" /><stop offset="1" stopColor="transparent" /></radialGradient>
        </defs>
        <g mask="url(#mb-mask)" opacity="0.72">
          <circle cx={HUB_X + 20} cy={HUB_Y} r="250" fill="url(#mb-hub)" />

          {/* connectors */}
          <g fill="none" strokeWidth="1.3">
            {S.map((d, i) => <path key={i} d={d} stroke="rgba(110,231,160,.26)" className="mb-dash" />)}
            <path d={HUB_IRS} stroke="rgba(248,113,113,.5)" className="mb-dash" />
          </g>

          {/* travelling packets */}
          {S.map((d, i) => (
            <circle key={i} r="3.4" className="mb-pkt" fill="var(--green)">
              <animateMotion dur={`${2.6 + i * 0.35}s`} begin={`${i * 0.45}s`} repeatCount="indefinite" path={d} />
            </circle>
          ))}
          <circle r="3.6" className="mb-pkt" fill="var(--red)"><animateMotion dur="3.1s" begin=".4s" repeatCount="indefinite" path={HUB_IRS} /></circle>

          {/* source nodes (left) */}
          {nodes.map(([x, y, kind], i) => (
            // Position lives on the outer group; the float animates the inner one. A CSS transform on the
            // same element would replace the SVG translate and snap the tile to the top-left corner.
            <g key={i} transform={`translate(${x},${y})`}><g className="mb-float" style={{ animationDelay: `${i * 0.8}s`, transformBox: "fill-box", transformOrigin: "center" } as React.CSSProperties}>
              <rect x="-18" y="-18" width="36" height="36" rx="10" fill="#0d0d0d" stroke="rgba(255,255,255,.18)" />
              {kind === "cash" && <text x="0" y="6" textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--green)">$</text>}
              {kind === "pay" && <text x="0" y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill="rgba(255,255,255,.78)">P2P</text>}
              {kind === "bank" && <g stroke="rgba(255,255,255,.75)" strokeWidth="1.5" fill="none" strokeLinecap="round"><path d="M-9,-3 L0,-10 L9,-3" /><path d="M-7,-2 V7 M-2.5,-2 V7 M2.5,-2 V7 M7,-2 V7" /><path d="M-10,9 H10" /></g>}
              {kind === "card" && <g stroke="rgba(255,255,255,.75)" strokeWidth="1.5" fill="none"><rect x="-10" y="-7" width="20" height="14" rx="2.5" /><path d="M-10,-1.5 H10" /></g>}
              {kind === "dot" && <circle r="4.5" fill="var(--green)" className="mb-pulse" />}
            </g></g>
          ))}

          {/* the # hub — just the logo mark, so nothing gets cut at the screen edge */}
          <g transform={`translate(${HUB_X - 10},${HUB_Y - 30})`}>
            <rect x="-4" y="-4" width="68" height="68" rx="18" fill="none" stroke="rgba(110,231,160,.2)" />
            <rect x="0" y="0" width="60" height="60" rx="15" fill="#101012" stroke="rgba(255,255,255,.24)" />
            <rect x="14" y="14" width="32" height="32" rx="9" fill="#fafafa" />
            <text x="30" y="37" textAnchor="middle" fontSize="20" fontWeight="800" fill="#000">#</text>
          </g>

          {/* IRS node (lower right, red) */}
          <g transform={`translate(${HUB_X + 70},${HUB_Y + 120})`} className="mb-pulse">
            <rect x="0" y="0" width="66" height="38" rx="11" fill="#140c0c" stroke="rgba(248,113,113,.55)" />
            <text x="33" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--red)">IRS</text>
          </g>
        </g>
      </svg>}
    </div>
  );
}

/* ---------------- Starfield (shared background) ---------------- */

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    let raf = 0; const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() }));
    const draw = (t: number) => {
      const w = (c.width = c.offsetWidth * devicePixelRatio), h = (c.height = c.offsetHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        const a = reduce ? 0.6 : 0.35 + 0.65 * Math.abs(Math.sin(st.p + t * 0.0006 * st.s));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />;
}

function Shell({ children, step, onBack, onHome }: { children: React.ReactNode; step: number; onBack?: () => void; onHome?: () => void }) {
  return (
    <div className="relative min-h-screen bg-black" style={pad}>
      {/* Setup content fills both columns, so keep the texture without tiles behind it. */}
      <MoneyBackdrop showFlow={false} />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[60vh]" style={{ background: "radial-gradient(60% 60% at 50% 0%, rgba(255,255,255,.08), transparent 70%)" }} />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between py-5">
        <button onClick={onHome} aria-label="The Number, home"><Wordmark size={34} /></button>
        <div className="flex items-center gap-4"><ol className="flex items-center gap-2 text-xs font-medium text-zinc-400" aria-label="Setup progress">
          {["Account", "Plan", "Connect"].map((s, i) => (
            <li key={s} className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full border ${i < step ? "border-white bg-white text-black" : i === step ? "border-white text-white" : "border-zinc-700"}`}>{i < step ? <Check size={13} /> : i + 1}</span><span className={`hidden sm:inline ${i === step ? "text-white" : ""}`}>{s}</span>{i < 2 && <span className="mx-1 hidden h-px w-6 bg-zinc-700 sm:inline-block" />}</li>
          ))}
        </ol><ThemeToggle /></div>
      </header>
      <div className="relative z-10 mx-auto max-w-6xl"><button className="btn btn-ghost !px-3.5 !py-2 text-sm" onClick={onBack}><ArrowLeft size={15} />Back</button></div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ---------------- Sign up ---------------- */

export type Account = { name: string; email: string; business: string; plan?: string };

type Draft = { name: string; email: string; business: string };

export function SignUp({ onDone, onBack, onHome, draft, onDraft }: { onDone: (a: Account) => void; onBack: () => void; onHome: () => void; draft: Draft; onDraft: (d: Draft) => void }) {
  // What was typed is kept by the parent, so coming Back to this step shows it again.
  const [name, setName] = useState(draft.name), [email, setEmail] = useState(draft.email), [business, setBusiness] = useState(draft.business);
  useEffect(() => { onDraft({ name, email, business }); }, [name, email, business, onDraft]);
  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Add your first name so we know what to call you.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("That email doesn't look right. Check for a typo.");
    if (!business.trim()) return setErr("Tell us what your business does, in your own words.");
    onDone({ name: name.trim().split(" ")[0], email: email.trim(), business: business.trim() });
  };
  return (
    <Shell step={0} onBack={onBack} onHome={onHome}>
      <div className="mx-auto grid max-w-5xl items-center gap-12 py-10 lg:grid-cols-2">
        <div className="hidden lg:block">
          <h1 className="headline font-display text-6xl font-semibold leading-[0.98]">Your money,<br />finally explained.</h1>
          <ul className="mt-8 space-y-4 text-zinc-400">
            {[[Timer, "See your Number in under a minute"], [ShieldCheck, "Bank connection through Plaid. We never move money"], [Lock, "Parents can follow along, read-only"]].map(([I, t]) => {
              const Icon = I as typeof Timer;
              return <li key={t as string} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full border border-zinc-800"><Icon size={16} /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <form onSubmit={submit} className="glass rise mx-auto w-full max-w-md p-7 sm:p-9" noValidate>
          <h2 className="font-display text-3xl font-semibold">Create your account</h2>
          <p className="mt-1 text-sm text-zinc-400">Takes 20 seconds.</p>
          {/* Fills in a fictional sample account (Jay). Not a Google or any other real sign-in. */}
          <button type="button" onClick={() => onDone({ name: "Jay", email: "jay@example.com", business: "Pressure washing" })} className="btn btn-ghost mt-6 w-full !rounded-xl">
            <User size={18} aria-hidden />
            Use a sample account
          </button>
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <label className="block text-sm font-medium" htmlFor="su-name">First name</label>
          <input id="su-name" className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jay" autoComplete="given-name" />
          <label className="mt-4 block text-sm font-medium" htmlFor="su-email">Email</label>
          <input id="su-email" className="input mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" />
          <label className="mt-4 block text-sm font-medium" htmlFor="su-biz">What's your business?</label>
          <input id="su-biz" className="input mt-1.5" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Pressure washing, lawn care, reselling…" />
          {err && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{err}</p>}
          <button className="btn btn-primary mt-6 w-full !rounded-xl !py-3.5">Create account <ArrowRight size={16} /></button>
        </form>
      </div>
    </Shell>
  );
}

/* ---------------- Pricing: $10 a month, or 5% off quarterly, 10% off yearly (lib/plans.ts) ---------------- */

const FEATURES = ["An estimate of what you owe the IRS, from your own transactions", "Connect your bank (Plaid) or QuickBooks", "Type in cash jobs and see your tax update", "Due-date and late-payment alerts", "Business-or-personal sorting", "Built for sole proprietors (Schedule C)", "CPA-ready export at tax time"];

export function Pricing({ onPick, onBack, onHome, current }: { name?: string; current?: string; onPick: (plan: string) => void; onBack: () => void; onHome: () => void }) {
  return (
    <Shell step={1} onBack={onBack} onHome={onHome}>
      <div className="mx-auto max-w-4xl py-10 text-center">
        <span className="chip text-zinc-300">One plan, three ways to pay</span>
        <h1 className="headline font-display mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1]">Pick how you pay.</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">Everything is included on every plan. Pay $10 a month, or save 5% paying every 3 months or 10% paying once a year.</p>
        <div className="mt-12 grid items-stretch gap-5 text-left md:grid-cols-3">
          {PLANS.map((p) => {
            const best = p.id === "annual";
            const every = p.months === 1 ? "every month" : p.months === 12 ? "once a year" : `every ${p.months} months`;
            return (
              <div key={p.id} data-plan={p.id} className={`relative flex flex-col rounded-[28px] p-7 ${best ? "border-2 border-white bg-[#101010] shadow-[0_0_80px_rgba(255,255,255,.12)]" : "glass"}`}>
                {best && <span className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">Best value</span>}
                <div className="text-center">
                  <div className="font-display text-2xl font-semibold">{p.name}</div>
                  {current === p.id && <span className="chip mt-2 text-zinc-300"><Check size={13} />Your current pick</span>}
                  <div className="font-display num mt-5 text-5xl font-semibold">{dollars(periodCents(p))}</div>
                  <div className="mt-1 text-sm text-zinc-300">billed {every}</div>
                  <div className="mt-3 min-h-[2.5rem] text-xs text-zinc-400">{p.discountPct ? <>{dollars(perMonthCents(p))} a month. {p.discountPct}% off {dollars(fullPriceCents(p))} at the monthly price.</> : <>Month to month.</>}</div>
                </div>
                <button className={`btn mt-auto w-full !rounded-xl !py-3.5 ${best ? "btn-primary" : "btn-ghost"}`} style={{ marginTop: 20 }} onClick={() => onPick(p.id)}>Choose {p.name}</button>
              </div>
            );
          })}
        </div>
        <div className="glass mx-auto mt-6 p-6 text-left sm:p-7">
          <div className="text-sm font-semibold">Every plan includes</div>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {FEATURES.map((f) => <li key={f} className="flex gap-3"><Check size={18} className="shrink-0" />{f}</li>)}
          </ul>
        </div>
        <p className="mt-8 text-xs text-zinc-400">Choosing a plan doesn&apos;t charge you. This version doesn&apos;t ask for card details or take payments yet.</p>
      </div>
    </Shell>
  );
}

type Pick = { kind: "bank" | "qbo" | "app"; title: string; sub: string; options: { name: string; note: string }[]; preset?: string };

const BANKS = [
  { name: "Chase", note: "chase.com" }, { name: "Huntington", note: "huntington.com" }, { name: "Fifth Third", note: "53.com" },
  { name: "PNC", note: "pnc.com" }, { name: "Bank of America", note: "bankofamerica.com" }, { name: "Wells Fargo", note: "wellsfargo.com" },
];

// Each app gets its own brand color (colors aren't trademarked). We use a simple letter mark, not a copy
// of any company's real logo or login page.
const APP_THEME: Record<string, { color: string; initial: string }> = {
  Venmo: { color: "#008CFF", initial: "V" },
  "Cash App": { color: "#00C244", initial: "$" },
  PayPal: { color: "#179BD7", initial: "P" },
  Stripe: { color: "#635BFF", initial: "S" },
};

/* A branded connect window, modeled on how aggregator flows look (phone step, permissions), in each app's color. */
export function AppConnect({ app, onClose, onDone, standalone = false }: { app: string; onClose: () => void; onDone: (app: string) => void; standalone?: boolean }) {
  const [step, setStep] = useState<"phone" | "consent" | "login" | "accounts" | "sync">("phone");
  const [phone, setPhone] = useState(""), [user, setUser] = useState(""), [pass, setPass] = useState(""), [err, setErr] = useState("");
  const [done, setDone] = useState(0);
  const [sel, setSel] = useState<string[]>([`${app} balance`]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const slug = app.toLowerCase().replace(/\s+/g, "");
  const theme = APP_THEME[app] || { color: "#7c7c85", initial: app[0] };
  const accts = [
    { id: `${app} balance`, label: `${app} balance`, note: "Business payments", logo: true },
    { id: "chk", label: "Chase", note: "Checking · ••1847", logo: false },
    { id: "sav", label: "Chase", note: "Savings · ••3302", logo: false },
    { id: "biz", label: "Chase", note: "Business credit · ••9021", logo: false },
  ];
  const tasks = [`Verifying ${sel.length} account${sel.length === 1 ? "" : "s"}`, `Reading 2026 payments`, "Sorting business from personal", "Working out what you owe"];
  useEffect(() => {
    if (step !== "sync") return;
    const t = window.setInterval(() => setDone((d) => d + 1), 650);
    return () => window.clearInterval(t);
  }, [step]);
  useEffect(() => { if (step === "sync" && done === tasks.length) { const t = window.setTimeout(() => onDone(app), 400); return () => window.clearTimeout(t); } }, [done, step, app, onDone, tasks.length]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && step !== "sync" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, step]);
  const login = (e: React.FormEvent) => { e.preventDefault(); if (!user.trim() || !pass) return setErr("Enter a username and password."); setUser(""); setPass(""); setStep("accounts"); };
  const btn = { background: theme.color, color: "#fff" };
  return (
    <div className={standalone ? "grid min-h-screen place-items-center bg-black p-4" : "fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"} role="dialog" aria-modal="true" aria-label={`Connect ${app}`}>
      <div className={`toast w-full max-w-[420px] overflow-hidden bg-[#0b0b0b] ${standalone ? "" : "rounded-2xl border border-zinc-700 shadow-[0_30px_120px_rgba(0,0,0,.8)]"}`}>
        {/* window chrome (only when shown inside the page; a real pop-up has the browser's own) */}
        {!standalone && <div className="flex items-center gap-3 border-b border-zinc-800 bg-[#111] px-4 py-2.5">
          <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /></span>
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-black/60 px-3 py-1 text-[11px] text-zinc-400"><Lock size={11} />connect.the-number12.vercel.app/{slug}</span>
          <button className="text-xs text-zinc-500 hover:text-white" onClick={onClose} disabled={step === "sync"} aria-label="Close">✕</button>
        </div>}
        {/* brand color band */}
        <div className="h-1.5 w-full" style={{ background: theme.color }} />
        <div className="p-6">
          <div className="flex items-center justify-center gap-3">
            <Logo size={44} />
            <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${step === "sync" ? "live-dot" : ""}`} style={{ background: theme.color, animationDelay: `${i * 0.2}s` }} />)}</span>
            <img src={`/${slug}logo.png`} alt={app} width={44} height={44} className="rounded-[13px] bg-white object-contain p-0.5" />
          </div>
          <div className="mt-2 text-center"><span className="chip text-[10px]" style={{ color: theme.color, borderColor: theme.color }}>{app} · Sandbox</span></div>

          {step === "phone" && (
            <form onSubmit={(e) => { e.preventDefault(); setStep("consent"); }} className="mt-5">
              <h3 className="font-display text-center text-xl font-semibold leading-snug">The Number uses {app} to connect your account</h3>
              <label className="mt-6 block text-sm font-medium" htmlFor="ap-phone">Phone number</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-zinc-700 bg-white/[0.04] px-3">
                <span className="text-sm text-zinc-400">🇺🇸 +1</span>
                <input id="ap-phone" inputMode="tel" className="w-full bg-transparent py-3 text-sm outline-none" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" autoFocus />
              </div>
              <p className="muted mt-2 flex items-start gap-2 text-xs"><span className="mt-0.5" style={{ color: theme.color }}>⚡</span>Use your phone number to connect faster next time.</p>
              <button className="btn mt-6 w-full !rounded-xl !py-3 font-semibold" style={btn}>Continue</button>
              <button type="button" className="mt-2 w-full py-2 text-sm text-zinc-400 hover:text-white" onClick={() => setStep("consent")}>Continue without phone number</button>
            </form>
          )}

          {step === "consent" && (
            <>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">Share this data with The Number?</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {[["Your payments", "Money in and out, this tax year"], ["Read only", "We can't send, move or request money"], ["Disconnect anytime", "From your account settings"]].map(([t, d]) => (
                  <li key={t} className="flex gap-3"><Check size={18} className="mt-0.5 shrink-0" style={{ color: theme.color }} /><span><span className="block font-medium">{t}</span><span className="muted text-xs">{d}</span></span></li>
                ))}
              </ul>
              <button className="btn mt-6 w-full !rounded-xl !py-3 font-semibold" style={btn} onClick={() => setStep("login")}>Allow</button>
              <button className="mt-2 w-full py-2 text-sm text-zinc-500 hover:text-white" onClick={onClose}>Cancel</button>
            </>
          )}

          {step === "login" && (
            <form onSubmit={login} autoComplete="off" noValidate>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">Sign in to {app}</h3>
              <label className="mt-5 block text-sm font-medium" htmlFor="ap-user">Enter username</label>
              <input id="ap-user" className="input mt-1.5" value={user} onChange={(e) => { setUser(e.target.value); setErr(""); }} autoComplete="off" autoFocus />
              <label className="mt-4 block text-sm font-medium" htmlFor="ap-pass">Enter password</label>
              <input id="ap-pass" type="password" className="input mt-1.5" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }} autoComplete="new-password" />
              {err && <p className="mt-2 text-sm text-zinc-400">{err}</p>}
              <button className="btn mt-5 w-full !rounded-xl !py-3 font-semibold" style={btn}>Sign in</button>
            </form>
          )}

          {step === "accounts" && (
            <>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">Select accounts to connect</h3>
              <p className="muted mt-1 text-center text-xs">Pair your {app} with a bank account for the full picture.</p>
              <ul className="mt-5 space-y-2">
                {accts.map((a) => {
                  const on = sel.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button type="button" onClick={() => toggle(a.id)} className="flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors" style={{ borderColor: on ? theme.color : "#27272a", background: on ? `${theme.color}14` : "transparent" }}>
                        {a.logo ? <img src={`/${slug}logo.png`} alt="" width={30} height={30} className="rounded-lg bg-white object-contain p-0.5" /> : <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-white text-black"><Landmark size={16} /></span>}
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.label}</span><span className="muted block truncate text-xs">{a.note}</span></span>
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border" style={{ background: on ? theme.color : "transparent", borderColor: on ? theme.color : "#52525b" }}>{on && <Check size={13} strokeWidth={3} className="text-white" />}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button className="btn mt-6 w-full !rounded-xl !py-3 font-semibold disabled:opacity-40" style={btn} disabled={sel.length === 0} onClick={() => setStep("sync")}>Connect {sel.length} account{sel.length === 1 ? "" : "s"}</button>
            </>
          )}

          {step === "sync" && (
            <>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">{done >= tasks.length ? "Connected" : `Connecting ${app}…`}</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {tasks.map((t, i) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full border text-white" style={{ background: i < done ? theme.color : "transparent", borderColor: i < done ? theme.color : "#3f3f46" }}>{i < done ? <Check size={14} strokeWidth={3} /> : i === done ? <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: theme.color }} /> : null}</span>
                    <span className={i <= done ? "text-white" : "text-zinc-500"}>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(done / tasks.length) * 100}%`, background: theme.color }} /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PickSheet({ pick, onPick, onClose, busy }: { pick: Pick; onPick: (name: string) => void; onClose: () => void; busy: boolean }) {
  const [chosen, setChosen] = useState(pick.preset || "");
  const [user, setUser] = useState(""), [pass, setPass] = useState(""), [err, setErr] = useState("");
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, busy]);
  const brand = pick.kind === "bank" ? "Plaid" : pick.kind === "qbo" ? "QuickBooks" : pick.preset || "App";
  // Sandbox test login: anything typed goes through. Nothing typed here is stored or sent anywhere.
  const login = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !pass) return setErr("Enter a username and password.");
    setUser(""); setPass(""); onPick(chosen);
  };
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-label={pick.title} onClick={() => !busy && onClose()}>
      <div className="toast w-full max-w-md rounded-t-[28px] border border-zinc-800 bg-[#0b0b0b] p-6 text-left sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><span className="chip text-zinc-300">{brand} · Sandbox</span><button className="text-sm text-zinc-500 hover:text-white" onClick={() => (chosen && !busy && !pick.preset ? setChosen("") : onClose())} disabled={busy}>{chosen && !busy && !pick.preset ? "Back" : "Close"}</button></div>
        {busy ? (
          <>
            <h3 className="font-display mt-4 text-2xl font-semibold">Connecting…</h3>
            <p className="muted mt-1 text-sm">{brand} is pulling your business transactions from {chosen || "your bank"}. Read-only.</p>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-white" /></div>
          </>
        ) : chosen ? (
          <form onSubmit={login} autoComplete="off" noValidate>
            <h3 className="font-display mt-4 text-2xl font-semibold">Sign in · {chosen}</h3>
            <label className="mt-5 block text-sm font-medium" htmlFor="sb-user">Enter username</label>
            <input id="sb-user" className="input mt-1.5" value={user} onChange={(e) => { setUser(e.target.value); setErr(""); }} autoComplete="off" />
            <label className="mt-4 block text-sm font-medium" htmlFor="sb-pass">Enter password</label>
            <input id="sb-pass" type="password" className="input mt-1.5" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }} autoComplete="new-password" />
            {err && <p className="mt-2 text-sm text-zinc-400">{err}</p>}
            <button className="btn btn-primary mt-5 w-full !rounded-xl !py-3.5">Sign in and connect</button>
          </form>
        ) : (
          <>
            <h3 className="font-display mt-4 text-2xl font-semibold">{pick.title}</h3>
            <p className="muted mt-1 text-sm">{pick.sub}</p>
            <ul className="mt-5 grid gap-2">
              {pick.options.map((o) => (
                <li key={o.name}><button className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 px-4 py-3.5 text-left hover:border-zinc-500" onClick={() => setChosen(o.name)}>
                  <span><span className="block font-medium">{o.name}</span><span className="muted block text-xs">{o.note}</span></span><ArrowRight size={16} className="text-zinc-500" />
                </button></li>
              ))}
            </ul>
            <p className="mt-5 text-[11px] text-zinc-500">Sandbox mode: {brand} connects a test account for the bank you pick.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- CSV drop-off ---------------- */

const TAG_LABEL: Record<Kind, string> = { business_income: "Business income", business_expense: "Business cost", personal: "Personal", transfer: "Between your accounts", tax_payment: "Tax payment", review: "Needs an answer" };
// Unsorted rows count as income only when money came in (lib/number.ts); say which.
const rowTag = (t: Txn) => (t.kind === "review" ? (t.amountCents > 0 ? "Needs an answer (counted as income)" : "Needs an answer (not counted)") : TAG_LABEL[t.kind]);
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Read statement CSVs in the browser only (nothing is uploaded anywhere), show what was found, and count it only on "Use".
function CsvDrop({ onUse }: { onUse: (txns: Txn[]) => void }) {
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");
  const gen = useRef(0); // only the latest selection may show its result
  const read = async (list: FileList | null) => {
    const mine = ++gen.current;
    setErr(""); setPreview(null); setStatus("");
    const files = [...(list || [])];
    try {
      const loaded = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, text: f.size > MAX_FILE_BYTES ? "" : await f.text() })));
      const p = readUploads(loaded);
      if (mine !== gen.current) return;
      setPreview(p); setStatus(`Read ${p.rows} rows from ${p.files.length} file${p.files.length === 1 ? "" : "s"}. Check them below before they count.`);
    } catch (e) { if (mine === gen.current) setErr((e as Error).message); }
  };
  const outside = preview ? preview.txns.filter((t) => !t.date.startsWith(String(TAX_YEAR))).length : 0;
  return (
    <div>
      <label htmlFor="csv-file" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed px-4 py-5 text-center text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-white ${over ? "border-white bg-white/[0.06]" : "border-zinc-600 hover:border-zinc-400"}`}>
        <input id="csv-file" type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => { read(e.target.files); e.target.value = ""; }} />
        <span className="font-medium">Upload a CSV instead</span>
        <span className="text-xs text-zinc-400">Drop files here or choose them. Chase, Cash App, Venmo, or any CSV with date, description and amount columns. Up to 2 MB each. Read on this device only.</span>
      </label>
      <p className="sr-only" role="status">{status}</p>
      {err && <p className="mt-2 text-sm" style={{ color: "var(--red)" }} role="alert">{err}</p>}
      {preview && (
        <div className="mt-3 rounded-2xl border border-zinc-800 p-4 text-sm" data-csv-preview>
          <div className="font-medium">Check before it counts</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-300">
            <dt className="text-zinc-400">Rows</dt><dd className="num text-right">{preview.rows} from {preview.files.length} file{preview.files.length === 1 ? "" : "s"}</dd>
            <dt className="text-zinc-400">Dates</dt><dd className="num text-right">{preview.first} to {preview.last}</dd>
            <dt className="text-zinc-400">Money in</dt><dd className="num text-right">{money(preview.inCents)}</dd>
            <dt className="text-zinc-400">Money out</dt><dd className="num text-right">{money(preview.outCents)}</dd>
          </dl>
          <ul className="mt-3 space-y-0.5 text-xs text-zinc-300">{(Object.keys(TAG_LABEL) as Kind[]).filter((k) => preview.byKind[k]).map((k) => <li key={k} className="flex justify-between"><span>{TAG_LABEL[k]}</span><span className="num">{preview.byKind[k]}</span></li>)}</ul>
          {outside > 0 && <p className="mt-2 text-xs text-zinc-300">{outside} row{outside === 1 ? " is" : "s are"} outside {TAX_YEAR} and won&apos;t count.</p>}
          <details className="mt-3 text-xs"><summary className="cursor-pointer text-zinc-300 underline-offset-2 hover:underline">See how each row was tagged</summary>
            <ul className="mt-2 max-h-56 divide-y divide-zinc-800 overflow-y-auto">{preview.txns.map((t) => <li key={t.id} className="py-1.5"><span className="block break-words text-zinc-300">{t.date} · {t.description || "(no note)"}</span><span className="block text-zinc-400">{money(Math.abs(t.amountCents))} {t.amountCents < 0 ? "out" : "in"} · {rowTag(t)}</span></li>)}</ul>
          </details>
          <p className="mt-3 text-xs text-zinc-400">Tags come from simple rules and can be wrong. Rows tagged &ldquo;Tax payment&rdquo; reduce this estimate, so check them.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary !rounded-xl" onClick={() => onUse(preview.txns)}>Use these transactions</button>
            <button className="btn btn-ghost !rounded-xl" onClick={() => setPreview(null)}>Start over</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Type it in (V7) ---------------- */

// Totals for the year so far, typed by hand. They have no dates, so the app shows the year's estimate and the next payment, never late periods.
function TypedIn({ onUse }: { onUse: (t: TypedTotals) => void }) {
  const [v, setV] = useState({ income: "", costs: "", paid: "" });
  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const income = parseTypedAmount(v.income, "income so far this year");
    const costs = parseTypedAmount(v.costs, "business costs so far this year");
    const paid = parseTypedAmount(v.paid, "estimated tax already paid", true);
    const bad = [income, costs, paid].find((x) => typeof x !== "number") as { error: string } | undefined;
    if (bad) return setErr(bad.error);
    setErr(""); onUse({ incomeCents: income as number, costsCents: costs as number, paidCents: paid as number });
  };
  const field = (k: keyof typeof v, label: string, hint: string) => (
    <div>
      <label className="block text-sm font-medium" htmlFor={`ti-${k}`}>{label}</label>
      <div className="mt-1.5 flex items-center gap-2 rounded-[14px] border border-zinc-700 bg-white/[0.04] px-3 focus-within:outline focus-within:outline-2 focus-within:outline-white">
        <span className="text-zinc-400" aria-hidden>$</span>
        <input id={`ti-${k}`} inputMode="decimal" autoComplete="off" className="w-full bg-transparent py-3 text-base outline-none" value={v[k]} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setErr(""); }} placeholder={hint} aria-describedby={err ? "ti-err" : undefined} />
      </div>
    </div>
  );
  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-zinc-800 p-4" data-typed-in>
      <div className="font-medium">Type in your totals instead</div>
      <p className="mt-1 text-xs text-zinc-400">From January 1 to today. Business costs means what you spent to run the business.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("income", "Income so far this year", "18,500")}
        {field("costs", "Business costs so far this year", "3,450")}
      </div>
      <div className="mt-3">{field("paid", "Estimated tax already paid (optional)", "0")}</div>
      {err && <p id="ti-err" className="mt-2 text-sm" style={{ color: "var(--red)" }} role="alert">{err}</p>}
      <p className="mt-3 text-xs text-zinc-400">Typed totals have no dates, so you&apos;ll see the estimate for the year so far and the next payment. The quarter-by-quarter view needs a CSV or a bank.</p>
      <button className="btn btn-primary mt-3 w-full !rounded-xl">Use these totals</button>
    </form>
  );
}

/* ---------------- QuickBooks (Intuit OAuth) ---------------- */

// Sends the browser to /api/qbo/connect, which redirects to Intuit's sign-in. It checks first (without following the redirect)
// so a site without QuickBooks keys shows a plain message here instead of a raw error page. Nothing here is a sample.
function QuickBooksButton({ onLeave }: { onLeave: () => void }) {
  const [state, setState] = useState<"idle" | "checking" | "leaving">("idle");
  const [msg, setMsg] = useState("");
  const start = async () => {
    setMsg(""); setState("checking");
    try {
      const r = await fetch("/api/qbo/connect", { redirect: "manual", cache: "no-store" });
      if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) { setState("leaving"); onLeave(); window.location.assign("/api/qbo/connect"); return; }
      const j = await r.json().catch(() => ({}));
      setMsg((j as { error?: string }).error || "QuickBooks couldn't start. Try again.");
    } catch { setMsg("QuickBooks couldn't start. Check your connection and try again."); }
    setState("idle");
  };
  return (
    <div className="flex flex-col gap-2">
      <button className="btn btn-ghost w-full !rounded-xl !py-3.5" onClick={start} disabled={state !== "idle"} aria-busy={state !== "idle" || undefined} data-qbo-connect>
        {state === "idle" ? "Connect QuickBooks" : state === "checking" ? "Checking QuickBooks…" : "Opening Intuit sign-in…"}
      </button>
      {msg && <span className="text-xs text-zinc-400" role="alert">{msg}</span>}
    </div>
  );
}

/* ---------------- Connect ---------------- */

export function Connect({ onPlaidSandbox, onPlaid, onCsv, onTyped, onLeaveForQuickBooks, busy, error, onBack, onHome }: { onLeaveForQuickBooks: () => void; onPlaidSandbox: (bank: string) => void; onPlaid: (d: { txns: Txn[]; balances: Profile["balances"]; source: string }) => void; onCsv: (txns: Txn[]) => void; onTyped: (t: TypedTotals) => void; busy: string; error: string; onBack: () => void; onHome: () => void }) {
  const [pick, setPick] = useState<Pick | null>(null);
  // The pop-up window tells us when the app is connected.
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "tn-connected") onPlaidSandbox(String(e.data.app)); };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [onPlaidSandbox]);
  const live = process.env.NEXT_PUBLIC_PLAID_ENV === "production";
  return (
    <Shell step={2} onBack={onBack} onHome={onHome}>
      <div className="mx-auto max-w-3xl py-12 text-center">
        <span className="chip text-zinc-300">Last step</span>
        <h1 className="headline font-display mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1]">Connect your business.</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">We read your income and business costs and estimate what you owe the IRS. Read-only.</p>
        <div className="glass mx-auto mt-10 grid max-w-xl gap-6 p-6 text-left sm:p-8">
          <div>
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black"><Landmark size={22} /></span>
              <div><div className="font-semibold">Your bank</div><div className="text-sm text-zinc-400">Chase, Huntington, Fifth Third and 12,000+ more, via Plaid</div></div>
            </div>
            <div className="mt-4"><PlaidButton onData={onPlaid} sandbox={!live} /></div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <div>
            <div className="flex items-center gap-4">
              <img src="/quickbooks-logo.svg" alt="" width={48} height={48} className="brand-logo h-12 w-12 shrink-0 p-2" />
              <div><div className="font-semibold">QuickBooks</div><div className="text-sm text-zinc-400">Already use QuickBooks? Sign in with Intuit to share your Profit &amp; Loss, read-only.</div></div>
            </div>
            <div className="mt-4"><QuickBooksButton onLeave={onLeaveForQuickBooks} /></div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-800" />payment apps<span className="h-px flex-1 bg-zinc-800" /></div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-display num text-4xl font-semibold text-white">2M+</div>
                <div className="mt-1 text-xs leading-snug text-zinc-400">businesses take payments on Venmo alone, and every one is reported to the IRS.</div>
              </div>
              <div className="border-l border-white/10 pl-4">
                <div className="font-display num text-4xl font-semibold text-white">74%</div>
                <div className="mt-1 text-xs leading-snug text-zinc-400">of sellers don't know when these apps report that income to the IRS.</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-zinc-400">
              <a className="underline" href="https://www.businessofapps.com/data/venmo-statistics/" target="_blank" rel="noreferrer">Business of Apps</a>
              <a className="underline" href="https://finance.yahoo.com/news/gig-workers-may-unprepared-2025-123000859.html" target="_blank" rel="noreferrer">Avalara survey</a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["Venmo", "Cash App", "PayPal", "Stripe"] as const).map((app) => (
              <button key={app} className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 px-2 py-4 text-sm font-medium hover:border-zinc-500" disabled={!!busy}
                onClick={() => {
                  const slug = app.toLowerCase().replace(/\s+/g, "");
                  const w = 460, h = 700, left = window.screenX + (window.outerWidth - w) / 2, top = window.screenY + (window.outerHeight - h) / 2;
                  const pop = window.open(`/connect/${slug}`, "tn-connect", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
                  if (!pop) setPick({ kind: "app", title: app, sub: "", options: [], preset: app });
                }}>
                <img src={`/${app.toLowerCase().replace(/\s+/g, "")}logo.png`} alt={app} width={40} height={40} className="rounded-xl bg-white object-contain p-1" />
                {app}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <CsvDrop onUse={onCsv} />
          <div className="flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <TypedIn onUse={onTyped} />
          {!live && <p className="rounded-xl border border-zinc-800 px-3 py-2 text-center text-xs text-zinc-400">Sandbox test login: <b className="text-white">user_good</b> / <b className="text-white">pass_good</b></p>}
          {busy && <p className="text-center text-sm text-zinc-300">Pulling your transactions…</p>}
          {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
        <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Read-only</span>
          <span className="flex items-center gap-1.5"><Lock size={14} /> We never move money</span>
          <span className="flex items-center gap-1.5"><Check size={14} /> Disconnect anytime</span>
        </div>
      </div>
      {pick && pick.kind === "app" && <AppConnect app={pick.preset || "App"} onClose={() => setPick(null)} onDone={(n) => onPlaidSandbox(n)} />}
      {pick && pick.kind !== "app" && <PickSheet pick={pick} busy={!!busy} onClose={() => setPick(null)} onPick={(n) => onPlaidSandbox(n)} />}
    </Shell>
  );
}
