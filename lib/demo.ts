import type { Profile } from "./types";

// Synthetic demo profile. All people, businesses and numbers are fictional.
export const DEMO_PROFILE: Profile = {
  ownerName: "Jay",
  businessName: "Jay's Pressure Washing",
  age: 17,
  state: "Ohio",
  parentRule: { label: "\"You're under $16,100, so you owe nothing\"", amountCents: 0 },
  asOf: "2026-11-06",
  priorYearTax: "yes", // the sample had tax last year, so the demo shows late periods and the penalty
  balances: [
    { name: "Chase checking", balanceCents: 184_012 },
    { name: "Cash App", balanceCents: 61_037 },
    { name: "Venmo", balanceCents: 19_951 },
  ],
  bills: [
    { name: "Phone bill (business line)", amountCents: 4_500, due: "2026-11-20" },
    { name: "Liability insurance renewal", amountCents: 48_000, due: "2026-12-01" },
    { name: "Surface cleaner replacement", amountCents: 18_900, due: "2027-03-15" },
  ],
};

export const DEMO_FILES = ["/demo/chase.csv", "/demo/cashapp.csv", "/demo/venmo.csv"];
