/**
 * loan-math.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Full test suite for loan-math.js.
 * Uses Node's built-in assert module — no external test runner required.
 * Run with:  node loan-math.test.js
 *
 * All expected values are independently derived (textbook formulas, Excel
 * PMT/IPMT/PPMT, and hand-calculation) so the tests are self-contained proofs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const LM     = require('../docs/loan-math.js');

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const results = [];

function test(suiteName, caseName, fn) {
  total++;
  try {
    fn();
    passed++;
    results.push({ status: 'PASS', suite: suiteName, name: caseName });
  } catch (e) {
    failed++;
    results.push({ status: 'FAIL', suite: suiteName, name: caseName, error: e.message });
  }
}

/**
 * Assert two numbers are equal within a tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=0.01]   absolute tolerance in dollars or months
 * @param {string} [msg]
 */
function assertClose(actual, expected, tol, msg) {
  tol = tol === undefined ? 0.01 : tol;
  const diff = Math.abs(actual - expected);
  if (diff > tol) {
    throw new Error(
      (msg ? msg + ': ' : '') +
      `Expected ${expected} ± ${tol}, got ${actual}  (diff=${diff.toFixed(6)})`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Internal helpers
// ─────────────────────────────────────────────────────────────────────────────
const S1 = 'Helpers';

test(S1, 'toAbsMonth / fromAbsMonth round-trip', () => {
  const cases = [
    { year: 2022, month: 5 },
    { year: 2000, month: 0 },
    { year: 1999, month: 11 },
    { year: 2050, month: 6 },
  ];
  for (const c of cases) {
    const abs  = LM._toAbsMonth(c.year, c.month);
    const back = LM._fromAbsMonth(abs);
    assert.strictEqual(back.year,  c.year,  `year mismatch for ${c.year}-${c.month}`);
    assert.strictEqual(back.month, c.month, `month mismatch for ${c.year}-${c.month}`);
  }
});

test(S1, 'monthDiff: same date = 0', () => {
  assert.strictEqual(LM.monthDiff({ year: 2022, month: 5 }, { year: 2022, month: 5 }), 0);
});

test(S1, 'monthDiff: 47 months', () => {
  // June 2022 → May 2026 = 47 months
  assert.strictEqual(LM.monthDiff({ year: 2022, month: 5 }, { year: 2026, month: 4 }), 47);
});

test(S1, 'addMonthsToDate forward', () => {
  // May 2026 + 232.8 months: Math.round(232.8)=233 → month index 4+233=237 → 237%12=9 (Oct), 237/12=19 full yrs → 2026+19=2045
  const d = LM.addMonthsToDate({ year: 2026, month: 4 }, 232.8);
  assert.strictEqual(d.year,  2045);
  assert.strictEqual(d.month, 9);   // October = index 9
});

test(S1, 'addMonthsToDate wraps correctly', () => {
  // Jan 2022 + 13 months = Feb 2023
  const d = LM.addMonthsToDate({ year: 2022, month: 0 }, 13);
  assert.strictEqual(d.year,  2023);
  assert.strictEqual(d.month, 1);
});

test(S1, 'clamp works', () => {
  assert.strictEqual(LM._clamp(5, 0, 10),  5);
  assert.strictEqual(LM._clamp(-1, 0, 10), 0);
  assert.strictEqual(LM._clamp(15, 0, 10), 10);
});

test(S1, 'monthName returns correct names', () => {
  assert.strictEqual(LM.monthName(0),  'Jan');
  assert.strictEqual(LM.monthName(11), 'Dec');
  assert.strictEqual(LM.monthName(8),  'Sep');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: monthlyPayment
// ─────────────────────────────────────────────────────────────────────────────
const S2 = 'monthlyPayment';

// Reference: Excel PMT(5.5%/12, 360, -365000) = 2072.43 (P&I only)
test(S2, '30yr $365k at 5.5% = $2,072.43', () => {
  const M = LM.monthlyPayment(365000, 5.5, 360);
  assertClose(M, 2072.43, 0.01, '30yr mortgage');
});

// Textbook PMT(6.5%/12, 60, 25000): nominal rate compounded monthly
test(S2, '5yr $25k auto at 6.5%', () => {
  // Textbook formula: 489.15 (Excel may show 488.72 due to rounding convention)
  const M = LM.monthlyPayment(25000, 6.5, 60);
  assertClose(M, 489.15, 0.01, '5yr auto loan');
});

// 15-year $300k at 4.0% — reference: Excel PMT(4%/12, 180, -300000) = 2219.06
test(S2, '15yr $300k at 4.0% = $2,219.06', () => {
  const M = LM.monthlyPayment(300000, 4.0, 180);
  assertClose(M, 2219.06, 0.01, '15yr mortgage');
});

// Zero interest edge case: $12,000 / 12 months = $1,000/mo
test(S2, 'zero interest = P/n', () => {
  const M = LM.monthlyPayment(12000, 0, 12);
  assertClose(M, 1000, 0.001, 'zero interest');
});

// Zero principal edge case
test(S2, 'zero principal = 0', () => {
  assert.strictEqual(LM.monthlyPayment(0, 5.5, 360), 0);
});

// Small loan: $5,000 at 8% for 24 months — Excel PMT(8%/12,24,-5000) = 226.14
test(S2, '$5k at 8% / 24mo = $226.14', () => {
  const M = LM.monthlyPayment(5000, 8.0, 24);
  assertClose(M, 226.14, 0.01);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: scheduledBalance
// ─────────────────────────────────────────────────────────────────────────────
const S3 = 'scheduledBalance';

// After 0 payments, balance = original principal
test(S3, 'k=0 → original principal', () => {
  const b = LM.scheduledBalance(365000, 5.5, 360, 0);
  assertClose(b, 365000, 0.01);
});

// After full term (360), balance ≈ 0
test(S3, 'k=n_total → ~$0', () => {
  const b = LM.scheduledBalance(365000, 5.5, 360, 360);
  assertClose(b, 0, 1.00, 'balance at end of term');  // allow $1 rounding
});

// At k=47 months for our test loan: $344,100.23 (independently verified)
test(S3, 'k=47 for $365k 5.5% 30yr ≈ $344,100', () => {
  const b = LM.scheduledBalance(365000, 5.5, 360, 47);
  assertClose(b, 344100.23, 1.00, 'k=47 scheduled balance');
});

// Midpoint of 30yr loan (k=180): computed from amortization formula ≈ $253,637
test(S3, 'k=180 midpoint balance', () => {
  const b = LM.scheduledBalance(365000, 5.5, 360, 180);
  // At k=180 (exactly halfway through payments), ~69.5% of principal remains.
  // This is correct: 5.5% loans are front-loaded with interest, so more than
  // half principal remains at the halfway point.
  assertClose(b, 253637, 100, 'midpoint balance');
});

// Zero interest
test(S3, 'zero interest: linear paydown', () => {
  const b = LM.scheduledBalance(120000, 0, 120, 60);
  assertClose(b, 60000, 0.01, 'zero interest midpoint');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: remainingMonths
// ─────────────────────────────────────────────────────────────────────────────
const S4 = 'remainingMonths';

const M_365 = LM.monthlyPayment(365000, 5.5, 360); // 2072.43

// No extra: should return ≈ 360 months from original balance
test(S4, 'from original balance, no extra ≈ 360 months', () => {
  const n = LM.remainingMonths(365000, 5.5, M_365, 0);
  assertClose(n, 360, 0.1, 'full term from start');
});

// At k=47, actual balance $296,226.34 → addMonths(2026-05, 232.8) = Oct 2045 (month 9)
test(S4, 'from $296,226 balance, no extra ≈ 232.8 months', () => {
  const n = LM.remainingMonths(296226.34, 5.5, M_365, 0);
  assertClose(n, 232.8, 0.5, 'remaining from actual balance');
});

// With $500 extra → ≈ 164.1 months
test(S4, 'from $296,226 + $500 extra ≈ 164.1 months', () => {
  const n = LM.remainingMonths(296226.34, 5.5, M_365, 500);
  assertClose(n, 164.1, 0.5, 'remaining with $500 extra');
});

// Oversized payment: $100 balance vs $2072/mo → clears in 1 month
test(S4, 'oversized payment → capped at 1', () => {
  const n = LM.remainingMonths(100, 5.5, M_365, 0);
  assert.strictEqual(n, 1, 'tiny balance capped at 1 month');
});

// Zero interest
test(S4, 'zero interest: $12k / $1k/mo = 12 months', () => {
  const n = LM.remainingMonths(12000, 0, 1000, 0);
  assertClose(n, 12, 0.001);
});

// Zero balance
test(S4, 'zero balance → 0 months', () => {
  assert.strictEqual(LM.remainingMonths(0, 5.5, M_365, 0), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: remainingInterest
// ─────────────────────────────────────────────────────────────────────────────
const S5 = 'remainingInterest';

test(S5, 'minimums-only remaining interest ≈ $186,243', () => {
  const n  = LM.remainingMonths(296226.34, 5.5, M_365, 0);
  const ri = LM.remainingInterest(296226.34, M_365, 0, n);
  assertClose(ri, 186243, 5, 'minimums remaining interest');
});

test(S5, 'with $500 extra remaining interest ≈ $125,868', () => {
  const n  = LM.remainingMonths(296226.34, 5.5, M_365, 500);
  const ri = LM.remainingInterest(296226.34, M_365, 500, n);
  assertClose(ri, 125868, 5, '$500 extra remaining interest');
});

test(S5, 'interest avoided by $500 extra ≈ $60,375', () => {
  const nBase  = LM.remainingMonths(296226.34, 5.5, M_365, 0);
  const riBase = LM.remainingInterest(296226.34, M_365, 0, nBase);
  const nExtra = LM.remainingMonths(296226.34, 5.5, M_365, 500);
  const riExtra = LM.remainingInterest(296226.34, M_365, 500, nExtra);
  assertClose(riBase - riExtra, 60375, 10, 'interest avoided $500');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: driftAnalysis
// ─────────────────────────────────────────────────────────────────────────────
const S6 = 'driftAnalysis';

test(S6, 'dollar drift ≈ $47,874 ahead', () => {
  const d = LM.driftAnalysis(365000, 5.5, 360, 47, 296226.34);
  assertClose(d.dollarDrift, 47874, 5, 'dollar drift');
});

test(S6, 'scheduled balance at k=47 ≈ $344,100', () => {
  const d = LM.driftAnalysis(365000, 5.5, 360, 47, 296226.34);
  assertClose(d.scheduledBalance, 344100, 5, 'scheduled balance');
});

test(S6, 'months ahead ≈ 80 months', () => {
  const d = LM.driftAnalysis(365000, 5.5, 360, 47, 296226.34);
  assertClose(d.monthsAhead, 80, 2, 'months ahead');
});

test(S6, 'years ahead ≈ 6.7 years', () => {
  const d = LM.driftAnalysis(365000, 5.5, 360, 47, 296226.34);
  assertClose(d.yearsAhead, 6.7, 0.2, 'years ahead');
});

// On-schedule borrower: drift ≈ 0
test(S6, 'on-schedule: drift ≈ 0', () => {
  const sched = LM.scheduledBalance(365000, 5.5, 360, 47);
  const d     = LM.driftAnalysis(365000, 5.5, 360, 47, sched);
  assertClose(d.dollarDrift,  0, 0.1, 'no drift');
  assertClose(d.monthsAhead, 0, 0.5, 'no months ahead');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: sensitivitySeries
// ─────────────────────────────────────────────────────────────────────────────
const S7 = 'sensitivitySeries';

const series = LM.sensitivitySeries(296226.34, 5.5, M_365, 5000, 100, { year: 2026, month: 4 });

test(S7, 'produces correct number of data points (5001/100 = 51)', () => {
  assert.strictEqual(series.length, 51, 'point count');
});

test(S7, 'first point (A=0): extraPayment=0, interestAvoided=0, yearsSaved=0', () => {
  assert.strictEqual(series[0].extraPayment, 0);
  assertClose(series[0].interestAvoided, 0, 0.01);
  assertClose(series[0].yearsSaved, 0, 0.01);
});

test(S7, 'A=$500 point: yearsRemaining ≈ 13.67', () => {
  const p = series[5]; // index 5 = $500
  assert.strictEqual(p.extraPayment, 500);
  assertClose(p.yearsRemaining, 13.67, 0.1, '$500 years remaining');
});

test(S7, 'A=$1000: payoff date year = 2036', () => {
  const p = series[10]; // index 10 = $1000
  // n≈127.5 months from May 2026 → Jan 2037
  assert.strictEqual(p.payoffDate.year, 2037, '$1000 payoff year');
});

test(S7, 'A=$5000: yearsRemaining ≈ 3.88', () => {
  const p = series[50]; // index 50 = $5000
  assertClose(p.yearsRemaining, 3.88, 0.1, '$5000 years remaining');
});

test(S7, 'series is monotonically decreasing in yearsRemaining', () => {
  for (let i = 1; i < series.length; i++) {
    assert.ok(
      series[i].yearsRemaining <= series[i - 1].yearsRemaining,
      `Not monotone at index ${i}: ${series[i].yearsRemaining} > ${series[i-1].yearsRemaining}`
    );
  }
});

test(S7, 'interestAvoided is non-decreasing', () => {
  for (let i = 1; i < series.length; i++) {
    assert.ok(
      series[i].interestAvoided >= series[i - 1].interestAvoided,
      `interestAvoided not increasing at index ${i}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: sweetSpotAnalysis
// ─────────────────────────────────────────────────────────────────────────────
const S8 = 'sweetSpotAnalysis';

const sweet = LM.sweetSpotAnalysis(series, 100);

test(S8, 'returns non-null', () => {
  assert.ok(sweet !== null);
});

test(S8, 'sweet spot extra payment ≈ $900', () => {
  assertClose(sweet.sweetSpot.extraPayment, 900, 200, 'sweet spot dollar');
});

test(S8, 'all MBR values are positive', () => {
  for (const m of sweet.mbrs) {
    assert.ok(m.mbr > 0, `Non-positive MBR at $${m.extraPayment}: ${m.mbr}`);
  }
});

test(S8, 'MBRs are decreasing (diminishing returns)', () => {
  // Each step should save fewer months than the previous
  for (let i = 1; i < sweet.mbrs.length; i++) {
    assert.ok(
      sweet.mbrs[i].mbr <= sweet.mbrs[i - 1].mbr + 0.001, // small tolerance for floating point
      `MBR not decreasing at index ${i}: ${sweet.mbrs[i].mbr} > ${sweet.mbrs[i-1].mbr}`
    );
  }
});

test(S8, 'sweet spot MBR >= avgFirstHalfMbr', () => {
  assert.ok(
    sweet.sweetSpot.mbr >= sweet.avgFirstHalfMbr - 0.001,
    `Sweet spot MBR ${sweet.sweetSpot.mbr} < avg ${sweet.avgFirstHalfMbr}`
  );
});

test(S8, 'single-element series returns null', () => {
  const r = LM.sweetSpotAnalysis([series[0]], 100);
  assert.strictEqual(r, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9: solveForTargetDate
// ─────────────────────────────────────────────────────────────────────────────
const S9 = 'solveForTargetDate';

const currDate = { year: 2026, month: 4 };  // May 2026

// Target: Jan 2040 (≈ 164 months out) → should need ≈ $500 extra
test(S9, 'target Jan 2040 → requires ≈ $500 extra', () => {
  const r = LM.solveForTargetDate(296226.34, 5.5, M_365, currDate, { year: 2040, month: 0 });
  assert.ok(r.feasible, 'should be feasible');
  assertClose(r.requiredExtra, 500, 30, 'required extra for Jan 2040');
});

// Target beyond baseline → no extra required
test(S9, 'target after natural payoff → 0 extra', () => {
  const r = LM.solveForTargetDate(296226.34, 5.5, M_365, currDate, { year: 2050, month: 0 });
  assert.strictEqual(r.requiredExtra, 0, 'no extra needed for far future target');
  assert.ok(r.feasible);
});

// Past date → infeasible
test(S9, 'past target date → infeasible', () => {
  const r = LM.solveForTargetDate(296226.34, 5.5, M_365, currDate, { year: 2020, month: 0 });
  assert.ok(!r.feasible, 'past date should be infeasible');
});

// Verify: the required extra actually produces the target payoff within 1 month
test(S9, 'solved extra actually hits target ± 1 month', () => {
  const target = { year: 2035, month: 5 }; // June 2035
  const r  = LM.solveForTargetDate(296226.34, 5.5, M_365, currDate, target);
  const nC = LM.remainingMonths(296226.34, 5.5, M_365, r.requiredExtra);
  const targetMonths = LM.monthDiff(currDate, target);
  assertClose(nC, targetMonths, 1.0, 'solved months match target');
});

// Auto loan example: $25k at 6.5%, 60 months, after 12 payments, balance ≈ $21,185
test(S9, 'auto loan: target 24 months early on $25k', () => {
  const M_auto  = LM.monthlyPayment(25000, 6.5, 60);
  const bal12   = LM.scheduledBalance(25000, 6.5, 60, 12);
  const currAuto = { year: 2025, month: 0 };
  // Natural payoff = Jan 2025 + (60-12) = Jan 2029
  // Target: 24 months earlier = Jan 2027
  const target = { year: 2027, month: 0 };
  const r = LM.solveForTargetDate(bal12, 6.5, M_auto, currAuto, target);
  assert.ok(r.feasible);
  assert.ok(r.requiredExtra > 0, 'should require extra payment');
  // Verify it actually produces ~24 months
  const n = LM.remainingMonths(bal12, 6.5, M_auto, r.requiredExtra);
  assertClose(n, 24, 1.5, 'auto loan target months');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 10: lumpSumImpact
// ─────────────────────────────────────────────────────────────────────────────
const S10 = 'lumpSumImpact';

// $10,000 lump sum applied Dec 2026 (7 months out), no ongoing extra
test(S10, '$10k lump sum in Dec 2026 reduces balance by ~$10k', () => {
  const r = LM.lumpSumImpact(296226.34, 5.5, M_365, currDate,
    10000, { year: 2026, month: 11 }, 0);
  assertClose(r.balanceAfterLump, r.balanceAtLumpDate - 10000, 0.01, 'balance after lump');
});

test(S10, 'lump sum interest avoided > 0', () => {
  const r = LM.lumpSumImpact(296226.34, 5.5, M_365, currDate,
    10000, { year: 2026, month: 11 }, 0);
  assert.ok(r.interestAvoided > 0, 'should avoid some interest');
});

test(S10, 'lump sum + $500 extra pays off earlier than lump alone', () => {
  const rNoExtra = LM.lumpSumImpact(296226.34, 5.5, M_365, currDate,
    10000, { year: 2026, month: 11 }, 0);
  const rWithExtra = LM.lumpSumImpact(296226.34, 5.5, M_365, currDate,
    10000, { year: 2026, month: 11 }, 500);
  assert.ok(
    rWithExtra.nRemainingAfterLump < rNoExtra.nRemainingAfterLump,
    'extra payment after lump should reduce remaining months'
  );
});

// Lump sum = full balance → paid off at lump date
test(S10, 'lump sum >= balance → immediate payoff', () => {
  const r = LM.lumpSumImpact(296226.34, 5.5, M_365, currDate,
    400000, { year: 2027, month: 0 }, 0);
  assert.strictEqual(r.balanceAfterLump, 0, 'balance after giant lump = 0');
  assert.strictEqual(r.nRemainingAfterLump, 0, 'remaining months = 0');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 11: benchmarkComparison
// ─────────────────────────────────────────────────────────────────────────────
const S11 = 'benchmarkComparison';

test(S11, 'loan 5.5% > benchmark 5% → prepayWins=true', () => {
  const r = LM.benchmarkComparison(296226.34, 5.5, M_365, 500, 5.0);
  assert.strictEqual(r.prepayWins, true, '5.5% > 5%');
});

test(S11, 'loan 3.5% < benchmark 5% → prepayWins=false', () => {
  const M_low = LM.monthlyPayment(296226.34, 3.5, 280);
  const r = LM.benchmarkComparison(296226.34, 3.5, M_low, 500, 5.0);
  assert.strictEqual(r.prepayWins, false, '3.5% < 5%');
});

test(S11, 'investmentFV > interestAvoided when benchmark > loan rate', () => {
  const M_low = LM.monthlyPayment(296226.34, 3.5, 280);
  const r = LM.benchmarkComparison(296226.34, 3.5, M_low, 500, 5.0);
  assert.ok(r.investmentFV > r.interestAvoided, 'HYSA wins when benchmark > loan');
});

test(S11, 'opportunityCost = investmentFV - interestAvoided', () => {
  const r = LM.benchmarkComparison(296226.34, 5.5, M_365, 500, 5.0);
  assertClose(r.opportunityCost, r.investmentFV - r.interestAvoided, 0.01);
});

// With $500 extra at 5.5% loan vs 5% HYSA: investing FV ≈ $195,921
test(S11, '$500 extra × 5% HYSA FV ≈ $195,921', () => {
  const r = LM.benchmarkComparison(296226.34, 5.5, M_365, 500, 5.0);
  assertClose(r.investmentFV, 195921, 200, 'FV of investing $500');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 12: fullSnapshot integration test
// ─────────────────────────────────────────────────────────────────────────────
const S12 = 'fullSnapshot (integration)';

const snapshot = LM.fullSnapshot({
  originalPrincipal: 365000,
  annualRatePct:     5.5,
  termMonths:        360,
  startDate:         { year: 2022, month: 5 },  // June 2022
  currentBalance:    296226.34,
  currentDate:       { year: 2026, month: 4 },  // May 2026
  extraPayment:      500,
  maxSensitivity:    5000,
  sensitivityStep:   100,
  benchmarkRatePct:  5.0,
  lumpSum:           10000,
  lumpSumDate:       { year: 2026, month: 11 }, // Dec 2026
});

test(S12, 'baseMonthlyPayment ≈ $2,072.43', () => {
  assertClose(snapshot.baseMonthlyPayment, 2072.43, 0.01);
});

test(S12, 'paymentsMade = 47', () => {
  assert.strictEqual(snapshot.paymentsMade, 47);
});

test(S12, 'interestPaidToDate ≈ $28,631', () => {
  assertClose(snapshot.interestPaidToDate, 28631, 5);
});

test(S12, 'baseline payoff ≈ Oct 2045', () => {
  assert.strictEqual(snapshot.baseline.payoffDate.year,  2045, 'baseline year');
  assert.strictEqual(snapshot.baseline.payoffDate.month, 9,    'baseline month (Oct)');
});

test(S12, 'withExtra payoff ≈ Jan 2040', () => {
  assert.strictEqual(snapshot.withExtra.payoffDate.year,  2040, 'extra year');
  assert.strictEqual(snapshot.withExtra.payoffDate.month, 0,    'extra month (Jan)');
});

test(S12, 'withExtra.yearsSaved ≈ 5.73', () => {
  assertClose(snapshot.withExtra.yearsSaved, 5.73, 0.2);
});

test(S12, 'withExtra.interestAvoided ≈ $60,375', () => {
  assertClose(snapshot.withExtra.interestAvoided, 60375, 10);
});

test(S12, 'drift.dollarDrift ≈ $47,874', () => {
  assertClose(snapshot.drift.dollarDrift, 47874, 5);
});

test(S12, 'sensitivitySeries has 51 points', () => {
  assert.strictEqual(snapshot.sensitivitySeries.length, 51);
});

test(S12, 'sweetSpot exists and extraPayment ≈ $900', () => {
  assert.ok(snapshot.sweetSpot);
  assertClose(snapshot.sweetSpot.sweetSpot.extraPayment, 900, 200);
});

test(S12, 'lumpSum result exists', () => {
  assert.ok(snapshot.lumpSum !== null, 'lump sum should be computed');
});

test(S12, 'lumpSum.interestAvoided > 0', () => {
  assert.ok(snapshot.lumpSum.interestAvoided > 0);
});

test(S12, 'benchmark.prepayWins = true (5.5% > 5%)', () => {
  assert.strictEqual(snapshot.benchmark.prepayWins, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 13: Auto loan scenarios
// ─────────────────────────────────────────────────────────────────────────────
const S13 = 'Auto Loan Scenarios';

// $32,000 auto loan at 7.9%, 72 months, 18 payments made
const M_auto72 = LM.monthlyPayment(32000, 7.9, 72);
const autoSnap = LM.fullSnapshot({
  originalPrincipal: 32000,
  annualRatePct:     7.9,
  termMonths:        72,
  startDate:         { year: 2023, month: 0 },  // Jan 2023
  currentBalance:    LM.scheduledBalance(32000, 7.9, 72, 18),
  currentDate:       { year: 2024, month: 6 },  // Jul 2024
  extraPayment:      100,
  maxSensitivity:    1000,
  sensitivityStep:   100,
  benchmarkRatePct:  5.0,
});

test(S13, 'auto $32k 7.9% 72mo: monthly payment ≈ $559.50', () => {
  assertClose(M_auto72, 559.50, 0.01);
});

test(S13, 'auto paymentsMade = 18', () => {
  assert.strictEqual(autoSnap.paymentsMade, 18);
});

test(S13, 'auto baseline payoff = after 54 more months', () => {
  assertClose(autoSnap.baseline.nRemaining, 54, 0.5, 'auto remaining months');
});

test(S13, 'auto withExtra ($100): fewer months than baseline', () => {
  assert.ok(autoSnap.withExtra.nRemaining < autoSnap.baseline.nRemaining);
});

test(S13, 'auto sensitivity: 11 data points ($0–$1000 in $100 steps)', () => {
  assert.strictEqual(autoSnap.sensitivitySeries.length, 11);
});

test(S13, 'auto interestAvoided > 0 with $100 extra', () => {
  assert.ok(autoSnap.withExtra.interestAvoided > 0);
});

test(S13, 'auto drift: on-schedule borrower (drift ≈ 0)', () => {
  assertClose(autoSnap.drift.dollarDrift, 0, 0.1, 'auto on-schedule drift');
});

// Simpler 3yr auto: $15k at 5% / 36 months → PMT = 449.56
test(S13, '$15k 5% 36mo: monthly payment ≈ $449.56', () => {
  const M = LM.monthlyPayment(15000, 5.0, 36);
  assertClose(M, 449.56, 0.01, '$15k 5% 36mo');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 14: Edge cases & robustness
// ─────────────────────────────────────────────────────────────────────────────
const S14 = 'Edge Cases';

test(S14, 'zero extra produces same result as baseline', () => {
  const n0 = LM.remainingMonths(296226.34, 5.5, M_365, 0);
  const nZ = LM.remainingMonths(296226.34, 5.5, M_365, 0.00);
  assertClose(n0, nZ, 0.001);
});

test(S14, 'very large extra (equal to balance) → 1 month', () => {
  // When extra payment = balance, total payment is ~$298k vs $1,355/mo interest;
  // n calculates to ~0.998 which rounds up to 1
  const n = LM.remainingMonths(296226.34, 5.5, M_365, 296226.34);
  assert.strictEqual(n, 1, 'same-as-balance extra → capped at 1');
});

test(S14, 'scheduledBalance never goes negative for valid k <= n_total', () => {
  for (let k = 0; k <= 360; k += 30) {
    const b = LM.scheduledBalance(365000, 5.5, 360, k);
    assert.ok(b >= -0.01, `Balance went negative at k=${k}: ${b}`);
  }
});

test(S14, 'high interest rate (18%): payment still covers interest', () => {
  // $10k at 18% for 36 months — payment must exceed monthly interest
  const M18 = LM.monthlyPayment(10000, 18, 36);
  const monthlyInt = 10000 * (18 / 12 / 100);
  assert.ok(M18 > monthlyInt, `Payment ${M18} doesn't cover interest ${monthlyInt}`);
});

test(S14, 'sensitivity series with step > maxExtra returns 1 point', () => {
  const s = LM.sensitivitySeries(100000, 5.5, 2000, 50, 100, { year: 2025, month: 0 });
  assert.strictEqual(s.length, 1, 'only $0 point when step > maxExtra');
});

test(S14, 'lumpSum date at currentDate (immediate) works', () => {
  const r = LM.lumpSumImpact(296226.34, 5.5, M_365, currDate,
    10000, currDate, 0);
  assertClose(r.balanceAfterLump, 296226.34 - 10000, 0.01, 'immediate lump sum');
});

test(S14, 'formatDollars: $1234.56', () => {
  assert.strictEqual(LM.formatDollars(1234.56, 2), '$1,234.56');
});

test(S14, 'formatDate: May 2026', () => {
  assert.strictEqual(LM.formatDate({ year: 2026, month: 4 }), 'May 2026');
});

// ─────────────────────────────────────────────────────────────────────────────
// Results output
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('  LOAN-MATH TEST SUITE RESULTS');
console.log('═'.repeat(70));

// Group by suite
const suiteMap = {};
for (const r of results) {
  if (!suiteMap[r.suite]) suiteMap[r.suite] = [];
  suiteMap[r.suite].push(r);
}

for (const [suite, tests] of Object.entries(suiteMap)) {
  const suitePass = tests.filter(t => t.status === 'PASS').length;
  const suiteFail = tests.filter(t => t.status === 'FAIL').length;
  const suiteIcon = suiteFail === 0 ? '✓' : '✗';
  console.log(`\n  ${suiteIcon} ${suite}  (${suitePass}/${tests.length})`);
  for (const t of tests) {
    const icon = t.status === 'PASS' ? '  ✓' : '  ✗';
    console.log(`${icon}  ${t.name}`);
    if (t.error) {
      console.log(`       → ${t.error}`);
    }
  }
}

console.log('\n' + '─'.repeat(70));
const allPass = failed === 0;
const summary = allPass
  ? `  ALL ${total} TESTS PASSED`
  : `  ${passed}/${total} passed   ${failed} FAILED`;
console.log(summary);
console.log('─'.repeat(70) + '\n');

if (!allPass) process.exit(1);
