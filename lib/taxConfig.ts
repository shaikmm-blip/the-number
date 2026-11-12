// Every tax parameter The Number uses lives here, with its source.
// Money is in integer cents. Rates are in basis points (1 bp = 0.01%).
// Verified against the sources below on Nov 7, 2026.

export const TAX_YEAR = 2026;

export const SOURCES = {
  irs2026: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
  ssWageBase: "https://www.journalofaccountancy.com/news/2025/oct/social-security-wage-base-and-cola-announced-for-2026/",
  seTax: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes",
  youngEntrepreneurs: "https://www.irs.gov/ht/newsroom/when-the-lemonade-stand-makes-bank-young-entrepreneurs-and-taxes",
  estimatedTaxes: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes",
  soleProprietor: "https://www.irs.gov/businesses/small-businesses-self-employed/sole-proprietorships",
  qbi: "https://www.irs.gov/newsroom/qualified-business-income-deduction",
};

// Human titles for the links above, as each page titles itself (checked Nov 12, 2026).
export const SOURCE_TITLES: Record<keyof typeof SOURCES, string> = {
  irs2026: "IRS: Tax inflation adjustments for tax year 2026",
  ssWageBase: "Journal of Accountancy: Social Security wage base for 2026",
  seTax: "IRS: Self-employment tax (Social Security and Medicare taxes)",
  youngEntrepreneurs: "IRS: Young entrepreneurs and taxes",
  estimatedTaxes: "IRS: Estimated taxes",
  soleProprietor: "IRS: Sole proprietorships",
  qbi: "IRS: Qualified business income deduction",
};

export const TAX_2026 = {
  // Self-employment tax: 12.4% Social Security + 2.9% Medicare, on 92.35% of net SE earnings.
  socialSecurityBps: 1240,
  medicareBps: 290,
  seEarningsFactorBps: 9235,
  // Social Security part stops at the wage base ($184,500 for 2026).
  ssWageBaseCents: 18_450_000,
  // You owe SE tax once net SE earnings reach $400, at any age.
  seThresholdCents: 40_000,
  // 2026 standard deduction, single filer: $16,100.
  standardDeductionCents: 1_610_000,
  // Sole proprietors: qualified business income (QBI) deduction, 20%, made permanent by the 2025 law (Section 199A).
  // Capped at 20% of taxable income before the deduction. Our users sit far below the income levels where extra limits apply.
  qbiBps: 2000,
  // 2026 single-filer brackets (upper bound of each bracket, in cents).
  brackets: [
    { upToCents: 1_240_000, rateBps: 1000 },
    { upToCents: 5_040_000, rateBps: 1200 },
    { upToCents: 10_570_000, rateBps: 2200 },
    { upToCents: 20_177_500, rateBps: 2400 },
    { upToCents: 25_622_500, rateBps: 3200 },
    { upToCents: 64_060_000, rateBps: 3500 },
    { upToCents: Number.MAX_SAFE_INTEGER, rateBps: 3700 },
  ],
  // Estimated tax due dates for tax year 2026.
  quarterlyDueDates: [
    { quarter: "Q1", due: "2026-04-15", covers: "Jan 1 – Mar 31" },
    { quarter: "Q2", due: "2026-06-15", covers: "Apr 1 – May 31" },
    { quarter: "Q3", due: "2026-09-15", covers: "Jun 1 – Aug 31" },
    { quarter: "Q4", due: "2027-01-15", covers: "Sep 1 – Dec 31" },
  ],
} as const;

export const ASSUMPTIONS = [
  "Sole proprietor (you and the business are the same for taxes, reported on Schedule C), single filer, no other income.",
  "Federal taxes only; state and local income taxes are not included yet.",
  "Includes the 20% qualified business income (QBI) deduction for sole proprietors. Leaves out the new $400 minimum QBI deduction, so the estimate leans slightly high.",
  "Dependents with net self-employment income above roughly the standard deduction get the full standard deduction; very small earners may differ.",
  "Educational estimate, not tax advice. Confirm with a CPA before filing.",
];
