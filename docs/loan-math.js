/**
 * loan-math.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure math library for loan amortization, payoff sensitivity, sweet-spot
 * detection, lump-sum impact, target-date reverse-solving, and benchmark
 * comparison. Zero runtime dependencies; works in both browser and Node.
 *
 * All functions are pure (no side effects, no I/O). Dates are represented as
 * { year: number, month: number } where month is 0-indexed (0 = January).
 * ─────────────────────────────────────────────────────────────────────────────
 */

;(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();          // Node / CommonJS
  } else {
    root.LoanMath = factory();           // Browser global
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Clamp a value between [min, max].
   * @param {number} v
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Convert an { year, month } (0-indexed month) to total months since epoch.
   * Used only for relative arithmetic; the absolute value is meaningless.
   * @param {number} year
   * @param {number} month  0-indexed
   * @returns {number}
   */
  function toAbsMonth(year, month) {
    return year * 12 + month;
  }

  /**
   * Convert total months since epoch back to { year, month } (0-indexed).
   * @param {number} abs
   * @returns {{ year: number, month: number }}
   */
  function fromAbsMonth(abs) {
    const year  = Math.floor(abs / 12);
    const month = abs % 12;
    return { year, month };
  }

  /**
   * Add `months` to a { year, month } object and return a new one.
   * Fractional months are rounded to the nearest whole month.
   * @param {{ year: number, month: number }} date
   * @param {number} months  may be fractional
   * @returns {{ year: number, month: number }}
   */
  function addMonthsToDate(date, months) {
    return fromAbsMonth(toAbsMonth(date.year, date.month) + Math.round(months));
  }

  /**
   * Return the difference in whole months between two { year, month } objects.
   * Positive when b is later than a.
   * @param {{ year: number, month: number }} a
   * @param {{ year: number, month: number }} b
   * @returns {number}
   */
  function monthDiff(a, b) {
    return toAbsMonth(b.year, b.month) - toAbsMonth(a.year, a.month);
  }

  /**
   * Short month name lookup.
   * @param {number} month  0-indexed
   * @returns {string}
   */
  const MONTH_NAMES = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec',
  ];
  function monthName(month) { return MONTH_NAMES[month % 12]; }

  // ── 1. Core Amortization ──────────────────────────────────────────────────

  /**
   * Compute the standard fixed monthly P&I payment.
   *
   * Formula:  M = P · [i(1+i)^n] / [(1+i)^n − 1]
   * Edge case: if annualRate = 0, reduces to P / n.
   *
   * @param {number} principal        original loan amount ($)
   * @param {number} annualRatePct    annual interest rate in percent (e.g. 5.5)
   * @param {number} termMonths       total number of payment months
   * @returns {number}  monthly payment amount ($)
   */
  function monthlyPayment(principal, annualRatePct, termMonths) {
    if (principal <= 0) return 0;
    const i = annualRatePct / 12 / 100;
    if (i === 0) return principal / termMonths;
    const factor = Math.pow(1 + i, termMonths);
    return principal * (i * factor) / (factor - 1);
  }

  /**
   * Compute the scheduled remaining balance after `paymentsMade` payments,
   * starting from `originalPrincipal`.
   *
   * Formula:  B(k) = P·(1+i)^k − M·[(1+i)^k − 1] / i
   *
   * @param {number} originalPrincipal  ($)
   * @param {number} annualRatePct      percent
   * @param {number} termMonths         original total months
   * @param {number} paymentsMade       k payments already made
   * @returns {number}  scheduled balance ($)
   */
  function scheduledBalance(originalPrincipal, annualRatePct, termMonths, paymentsMade) {
    const i = annualRatePct / 12 / 100;
    const M = monthlyPayment(originalPrincipal, annualRatePct, termMonths);
    if (i === 0) return originalPrincipal - M * paymentsMade;
    const factor = Math.pow(1 + i, paymentsMade);
    return originalPrincipal * factor - M * (factor - 1) / i;
  }

  /**
   * Compute the number of months to pay off `currentBalance` given a
   * combined monthly payment of (basePayment + extraPayment).
   *
   * Formula:  n = −ln(1 − i·P / (M+A)) / ln(1+i)
   * Edge case: zero interest → linear P / totalPayment.
   * Edge case: payment covers balance in < 1 month → returns 1.
   *
   * @param {number} currentBalance     remaining principal ($)
   * @param {number} annualRatePct      percent
   * @param {number} basePayment        standard monthly P&I ($)
   * @param {number} extraPayment       additional monthly principal ($), default 0
   * @returns {number}  months remaining (may be fractional)
   */
  function remainingMonths(currentBalance, annualRatePct, basePayment, extraPayment) {
    extraPayment = extraPayment || 0;
    if (currentBalance <= 0) return 0;
    const total = basePayment + extraPayment;
    const i = annualRatePct / 12 / 100;
    if (i === 0) return currentBalance / total;
    const denom = 1 - (i * currentBalance / total);
    if (denom <= 0 || denom >= 1 && i * currentBalance >= total) return 1; // oversized payment – loan gone next period
    // If payment would clear the balance within 1 month, treat as 1
    if (-Math.log(denom) / Math.log(1 + i) <= 1) return 1;
    return -Math.log(denom) / Math.log(1 + i);
  }

  /**
   * Compute the total remaining interest to be paid given remaining months.
   *
   * totalInterest = (basePayment + extraPayment) × nRemaining − currentBalance
   *
   * @param {number} currentBalance
   * @param {number} basePayment
   * @param {number} extraPayment
   * @param {number} nRemaining      from remainingMonths()
   * @returns {number}
   */
  function remainingInterest(currentBalance, basePayment, extraPayment, nRemaining) {
    return (basePayment + (extraPayment || 0)) * nRemaining - currentBalance;
  }

  // ── 2. Drift Analysis (Historical Look-Back) ──────────────────────────────

  /**
   * Compute how far ahead (or behind) schedule the borrower is.
   *
   * @param {number} originalPrincipal
   * @param {number} annualRatePct
   * @param {number} termMonths
   * @param {number} paymentsMade         months elapsed since origination
   * @param {number} actualCurrentBalance
   * @returns {{
   *   scheduledBalance: number,   what the balance *should* be
   *   actualBalance:    number,
   *   dollarDrift:      number,   positive = ahead (actual < scheduled)
   *   monthsAhead:      number,   positive = ahead of original schedule
   *   yearsAhead:       number
   * }}
   */
  function driftAnalysis(originalPrincipal, annualRatePct, termMonths, paymentsMade, actualCurrentBalance) {
    const M     = monthlyPayment(originalPrincipal, annualRatePct, termMonths);
    const sched = scheduledBalance(originalPrincipal, annualRatePct, termMonths, paymentsMade);
    const drift = sched - actualCurrentBalance;  // positive = ahead

    // Remaining months on original schedule from today
    const scheduledRemaining = termMonths - paymentsMade;
    // Remaining months at minimum payment from actual balance
    const actualRemaining = remainingMonths(actualCurrentBalance, annualRatePct, M, 0);
    const monthsAhead = scheduledRemaining - actualRemaining;

    return {
      scheduledBalance: sched,
      actualBalance:    actualCurrentBalance,
      dollarDrift:      drift,
      monthsAhead:      monthsAhead,
      yearsAhead:       monthsAhead / 12,
    };
  }

  // ── 3. Payoff Sensitivity (Look-Ahead) ────────────────────────────────────

  /**
   * Generate sensitivity data: for each extra payment level from 0 to maxExtra
   * in `step` increments, compute payoff info.
   *
   * @param {number} currentBalance
   * @param {number} annualRatePct
   * @param {number} basePayment          standard monthly P&I
   * @param {number} maxExtra             maximum extra payment to model ($)
   * @param {number} step                 increment (default 100)
   * @param {{ year: number, month: number }} currentDate   for projecting payoff dates
   * @returns {Array<{
   *   extraPayment:    number,
   *   totalPayment:    number,
   *   nRemaining:      number,
   *   yearsRemaining:  number,
   *   payoffDate:      { year, month },
   *   remainingInterest: number,
   *   interestAvoided: number,   vs $0 extra scenario
   *   yearsSaved:      number
   * }>}
   */
  function sensitivitySeries(currentBalance, annualRatePct, basePayment, maxExtra, step, currentDate) {
    step = step || 100;
    const points = [];
    let baselineNRemaining = null;
    let baselineInterest   = null;

    for (let extra = 0; extra <= maxExtra; extra += step) {
      const n    = remainingMonths(currentBalance, annualRatePct, basePayment, extra);
      const ri   = remainingInterest(currentBalance, basePayment, extra, n);
      const pd   = addMonthsToDate(currentDate, n);

      if (baselineNRemaining === null) {
        baselineNRemaining = n;
        baselineInterest   = ri;
      }

      points.push({
        extraPayment:      extra,
        totalPayment:      basePayment + extra,
        nRemaining:        n,
        yearsRemaining:    n / 12,
        payoffDate:        pd,
        remainingInterest: ri,
        interestAvoided:   baselineInterest - ri,
        yearsSaved:        (baselineNRemaining - n) / 12,
      });
    }
    return points;
  }

  // ── 4. Sweet Spot Detection ───────────────────────────────────────────────

  /**
   * Compute the Marginal Benefit Ratio (MBR) at each step of a sensitivity
   * series and identify the sweet spot.
   *
   * MBR_k = (yearsSaved_k − yearsSaved_{k−1}) / (step / 100) × 12
   *         → months saved per $100 additional
   *
   * Sweet spot = last step where MBR ≥ average MBR of the first half of range.
   * This is the "elbow": maximum efficiency before diminishing returns dominate.
   *
   * @param {Array} series   output of sensitivitySeries()
   * @param {number} step    same step used in sensitivitySeries (default 100)
   * @returns {{
   *   mbrs: Array<{ extraPayment, mbr, yearsSaved }>,
   *   sweetSpot: { extraPayment, mbr, yearsSaved },
   *   avgFirstHalfMbr: number,
   *   sweetSpotIndex: number
   * }}
   */
  function sweetSpotAnalysis(series, step) {
    step = step || 100;
    if (series.length < 2) return null;

    const mbrs = [];
    for (let i = 1; i < series.length; i++) {
      const deltaYrs = series[i].yearsSaved - series[i - 1].yearsSaved;
      const mbr      = deltaYrs * 12 / (step / 100); // months per $100
      mbrs.push({
        extraPayment: series[i].extraPayment,
        mbr,
        yearsSaved: series[i].yearsSaved,
      });
    }

    const half = Math.floor(mbrs.length / 2);
    const avgFirstHalf = mbrs.slice(0, half).reduce((s, m) => s + m.mbr, 0) / half;

    let sweetIdx  = 0;
    let sweetItem = mbrs[0];
    for (let i = 0; i < mbrs.length; i++) {
      if (mbrs[i].mbr >= avgFirstHalf) {
        sweetIdx  = i;
        sweetItem = mbrs[i];
      }
    }

    return {
      mbrs,
      sweetSpot:       sweetItem,
      avgFirstHalfMbr: avgFirstHalf,
      sweetSpotIndex:  sweetIdx,
    };
  }

  // ── 5. Target-Date Reverse Solver ─────────────────────────────────────────

  /**
   * Given a desired payoff date, compute the required extra monthly payment
   * to hit exactly that date.
   *
   * Strategy: binary search on extraPayment → remainingMonths converges.
   *
   * @param {number} currentBalance
   * @param {number} annualRatePct
   * @param {number} basePayment
   * @param {{ year: number, month: number }} currentDate
   * @param {{ year: number, month: number }} targetDate
   * @returns {{
   *   requiredExtra:   number,   extra monthly payment needed
   *   totalPayment:    number,
   *   nRemaining:      number,
   *   targetMonths:    number,   months between currentDate and targetDate
   *   remainingInterest: number,
   *   interestAvoided: number,
   *   feasible:        boolean,  false if target is impossible (too soon)
   *   minPossibleMonths: number  physical floor: 1 month
   * }}
   */
  function solveForTargetDate(currentBalance, annualRatePct, basePayment, currentDate, targetDate) {
    const i = annualRatePct / 12 / 100;
    const targetMonths = monthDiff(currentDate, targetDate);

    // Baseline (no extra)
    const baselineN  = remainingMonths(currentBalance, annualRatePct, basePayment, 0);
    const baselineRI = remainingInterest(currentBalance, basePayment, 0, baselineN);

    if (targetMonths <= 0) {
      return {
        requiredExtra:     currentBalance, // pay it all now
        totalPayment:      currentBalance,
        nRemaining:        0,
        targetMonths:      targetMonths,
        remainingInterest: 0,
        interestAvoided:   baselineRI,
        feasible:          false,
        minPossibleMonths: 1,
      };
    }

    // If target >= baseline, no extra needed
    if (targetMonths >= baselineN) {
      return {
        requiredExtra:     0,
        totalPayment:      basePayment,
        nRemaining:        baselineN,
        targetMonths:      targetMonths,
        remainingInterest: baselineRI,
        interestAvoided:   0,
        feasible:          true,
        minPossibleMonths: 1,
      };
    }

    // Binary search: find extra s.t. remainingMonths ≈ targetMonths
    let lo = 0, hi = currentBalance * 2, extra = 0;
    for (let iter = 0; iter < 64; iter++) {
      const mid = (lo + hi) / 2;
      const n   = remainingMonths(currentBalance, annualRatePct, basePayment, mid);
      if (Math.abs(n - targetMonths) < 0.001) { extra = mid; break; }
      if (n > targetMonths) lo = mid;
      else                  hi = mid;
      extra = mid;
    }

    const nFinal = remainingMonths(currentBalance, annualRatePct, basePayment, extra);
    const ri     = remainingInterest(currentBalance, basePayment, extra, nFinal);

    return {
      requiredExtra:     extra,
      totalPayment:      basePayment + extra,
      nRemaining:        nFinal,
      targetMonths:      targetMonths,
      remainingInterest: ri,
      interestAvoided:   baselineRI - ri,
      feasible:          true,
      minPossibleMonths: 1,
    };
  }

  // ── 6. Lump Sum Impact ────────────────────────────────────────────────────

  /**
   * Compute the effect of a one-time lump sum payment applied at a future date.
   *
   * Steps:
   *   1. Project balance forward from currentDate to lumpSumDate (minimum pmts).
   *   2. Apply lump sum to get post-lump balance.
   *   3. Compute payoff from post-lump balance with optional extraMonthly.
   *
   * @param {number} currentBalance
   * @param {number} annualRatePct
   * @param {number} basePayment
   * @param {{ year, month }} currentDate
   * @param {number} lumpSum            one-time extra principal ($)
   * @param {{ year, month }} lumpSumDate
   * @param {number} extraMonthlyAfter  optional ongoing extra after lump sum
   * @returns {{
   *   balanceAtLumpDate:  number,
   *   balanceAfterLump:   number,
   *   lumpSumMonthsIn:    number,
   *   payoffDate:         { year, month },
   *   nRemainingAfterLump: number,
   *   remainingInterest:  number,
   *   interestAvoided:    number,   vs minimums-only baseline
   *   yearsSaved:         number
   * }}
   */
  function lumpSumImpact(currentBalance, annualRatePct, basePayment, currentDate,
                         lumpSum, lumpSumDate, extraMonthlyAfter) {
    extraMonthlyAfter = extraMonthlyAfter || 0;
    const i = annualRatePct / 12 / 100;

    // Baseline (no lump, no extra)
    const baselineN  = remainingMonths(currentBalance, annualRatePct, basePayment, 0);
    const baselineRI = remainingInterest(currentBalance, basePayment, 0, baselineN);

    const monthsToLump = clamp(monthDiff(currentDate, lumpSumDate), 0, Math.floor(baselineN));

    // Project balance to lump sum date using minimum payments
    let balAtLump;
    if (i === 0) {
      balAtLump = currentBalance - basePayment * monthsToLump;
    } else {
      const factor = Math.pow(1 + i, monthsToLump);
      balAtLump    = currentBalance * factor - basePayment * (factor - 1) / i;
    }
    balAtLump = Math.max(0, balAtLump);

    const balAfterLump = Math.max(0, balAtLump - lumpSum);

    if (balAfterLump === 0) {
      return {
        balanceAtLumpDate:   balAtLump,
        balanceAfterLump:    0,
        lumpSumMonthsIn:     monthsToLump,
        payoffDate:          lumpSumDate,
        nRemainingAfterLump: 0,
        remainingInterest:   0,
        interestAvoided:     baselineRI,
        yearsSaved:          baselineN / 12,
      };
    }

    const nAfter  = remainingMonths(balAfterLump, annualRatePct, basePayment, extraMonthlyAfter);
    const ri      = remainingInterest(balAfterLump, basePayment, extraMonthlyAfter, nAfter);
    const payoff  = addMonthsToDate(lumpSumDate, nAfter);

    // Total remaining interest from today perspective:
    // interest accrued from now → lump date + interest from lump → payoff
    const interestToLump = basePayment * monthsToLump - (currentBalance - balAtLump);
    const totalRemainingInt = Math.max(0, interestToLump + ri);
    const avoided = baselineRI - totalRemainingInt;

    return {
      balanceAtLumpDate:   balAtLump,
      balanceAfterLump:    balAfterLump,
      lumpSumMonthsIn:     monthsToLump,
      payoffDate:          payoff,
      nRemainingAfterLump: nAfter,
      remainingInterest:   totalRemainingInt,
      interestAvoided:     avoided,
      yearsSaved:          (baselineN - (monthsToLump + nAfter)) / 12,
    };
  }

  // ── 7. Benchmark Comparison ───────────────────────────────────────────────

  /**
   * Compare prepaying the loan vs. investing the extra payment at a benchmark
   * rate for the same duration (the minimum-payment remaining term).
   *
   * FV of investing:  A × [(1 + r/12)^n − 1] / (r/12)
   *
   * @param {number} currentBalance
   * @param {number} annualRatePct      loan rate
   * @param {number} basePayment
   * @param {number} extraPayment       extra being compared
   * @param {number} benchmarkRatePct   e.g. 5.0 for a 5% HYSA
   * @returns {{
   *   nRemainingBaseline:  number,   months at minimum payment
   *   interestAvoided:     number,   by prepaying
   *   investmentFV:        number,   FV of investing instead
   *   opportunityCost:     number,   investmentFV − interestAvoided (positive = invest wins)
   *   prepayWins:          boolean,  true when loan rate > benchmark
   *   loanRate:            number,
   *   benchmarkRate:       number
   * }}
   */
  function benchmarkComparison(currentBalance, annualRatePct, basePayment, extraPayment, benchmarkRatePct) {
    const nBase  = remainingMonths(currentBalance, annualRatePct, basePayment, 0);
    const riBase = remainingInterest(currentBalance, basePayment, 0, nBase);
    const nExtra = remainingMonths(currentBalance, annualRatePct, basePayment, extraPayment);
    const riExtra = remainingInterest(currentBalance, basePayment, extraPayment, nExtra);
    const intAvoided = riBase - riExtra;

    const r = benchmarkRatePct / 12 / 100;
    let fv;
    if (r === 0) {
      fv = extraPayment * nBase;
    } else {
      fv = extraPayment * (Math.pow(1 + r, nBase) - 1) / r;
    }

    return {
      nRemainingBaseline: nBase,
      interestAvoided:    intAvoided,
      investmentFV:       fv,
      opportunityCost:    fv - intAvoided,
      prepayWins:         annualRatePct >= benchmarkRatePct,
      loanRate:           annualRatePct,
      benchmarkRate:      benchmarkRatePct,
    };
  }

  // ── 8. Full Loan Snapshot ─────────────────────────────────────────────────

  /**
   * Convenience function: compute a complete snapshot combining all analyses.
   * Returns the full picture for a given loan state and simulation parameters.
   *
   * @param {object} opts
   * @param {number} opts.originalPrincipal
   * @param {number} opts.annualRatePct
   * @param {number} opts.termMonths
   * @param {{ year, month }} opts.startDate        loan origination (0-indexed month)
   * @param {number} opts.currentBalance
   * @param {{ year, month }} opts.currentDate
   * @param {number} [opts.extraPayment=0]
   * @param {number} [opts.maxSensitivity=5000]
   * @param {number} [opts.sensitivityStep=100]
   * @param {number} [opts.benchmarkRatePct=5.0]
   * @param {number} [opts.lumpSum=0]
   * @param {{ year, month }} [opts.lumpSumDate]
   * @returns {object}  complete analysis object
   */
  function fullSnapshot(opts) {
    const {
      originalPrincipal,
      annualRatePct,
      termMonths,
      startDate,
      currentBalance,
      currentDate,
      extraPayment      = 0,
      maxSensitivity    = 5000,
      sensitivityStep   = 100,
      benchmarkRatePct  = 5.0,
      lumpSum           = 0,
      lumpSumDate,
    } = opts;

    const M = monthlyPayment(originalPrincipal, annualRatePct, termMonths);
    const paymentsMade = monthDiff(startDate, currentDate);

    // Payments made in dollars
    const totalPaidToDate     = M * paymentsMade;
    const principalPaidToDate = originalPrincipal - currentBalance;
    const interestPaidToDate  = totalPaidToDate - principalPaidToDate;

    // Baseline (no extra)
    const nBase   = remainingMonths(currentBalance, annualRatePct, M, 0);
    const riBase  = remainingInterest(currentBalance, M, 0, nBase);
    const basePayoffDate = addMonthsToDate(currentDate, nBase);

    // With extra
    const nExtra  = remainingMonths(currentBalance, annualRatePct, M, extraPayment);
    const riExtra = remainingInterest(currentBalance, M, extraPayment, nExtra);
    const extraPayoffDate = addMonthsToDate(currentDate, nExtra);

    // Original payoff date
    const origPayoffDate = addMonthsToDate(startDate, termMonths);

    // Drift
    const drift = driftAnalysis(originalPrincipal, annualRatePct, termMonths, paymentsMade, currentBalance);

    // Sensitivity
    const series = sensitivitySeries(currentBalance, annualRatePct, M, maxSensitivity, sensitivityStep, currentDate);

    // Sweet spot
    const sweet = sweetSpotAnalysis(series, sensitivityStep);

    // Benchmark
    const bench = benchmarkComparison(currentBalance, annualRatePct, M, extraPayment, benchmarkRatePct);

    // Lump sum (if provided)
    let lump = null;
    if (lumpSum > 0 && lumpSumDate) {
      lump = lumpSumImpact(currentBalance, annualRatePct, M, currentDate, lumpSum, lumpSumDate, extraPayment);
    }

    // Lifetime totals
    const origTotalInterest = M * termMonths - originalPrincipal;

    return {
      // Inputs echoed
      originalPrincipal,
      annualRatePct,
      termMonths,
      startDate,
      currentDate,
      currentBalance,
      extraPayment,

      // Derived base values
      baseMonthlyPayment:   M,
      paymentsMade,
      totalPaidToDate,
      principalPaidToDate,
      interestPaidToDate,
      origTotalInterest,
      origPayoffDate,

      // Baseline scenario
      baseline: {
        nRemaining:        nBase,
        yearsRemaining:    nBase / 12,
        payoffDate:        basePayoffDate,
        remainingInterest: riBase,
        lifetimeInterest:  interestPaidToDate + riBase,
      },

      // With-extra scenario
      withExtra: {
        nRemaining:        nExtra,
        yearsRemaining:    nExtra / 12,
        payoffDate:        extraPayoffDate,
        remainingInterest: riExtra,
        lifetimeInterest:  interestPaidToDate + riExtra,
        interestAvoided:   riBase - riExtra,
        yearsSaved:        (nBase - nExtra) / 12,
        monthsSaved:       nBase - nExtra,
      },

      // Drift analysis
      drift,

      // Sensitivity series
      sensitivitySeries: series,

      // Sweet spot
      sweetSpot: sweet,

      // Benchmark
      benchmark: bench,

      // Lump sum (null if not configured)
      lumpSum: lump,
    };
  }

  // ── 9. Utility / Formatting helpers ──────────────────────────────────────

  /**
   * Format a dollar amount to a readable string.
   * @param {number} amount
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatDollars(amount, decimals) {
    decimals = decimals === undefined ? 0 : decimals;
    return '$' + amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Format a { year, month } date to "Mon YYYY".
   * @param {{ year: number, month: number }} date
   * @returns {string}
   */
  function formatDate(date) {
    return monthName(date.month) + ' ' + date.year;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    // Core math
    monthlyPayment,
    scheduledBalance,
    remainingMonths,
    remainingInterest,

    // Analysis
    driftAnalysis,
    sensitivitySeries,
    sweetSpotAnalysis,
    solveForTargetDate,
    lumpSumImpact,
    benchmarkComparison,

    // All-in-one
    fullSnapshot,

    // Utilities
    addMonthsToDate,
    monthDiff,
    monthName,
    formatDollars,
    formatDate,

    // Exposed for testing
    _clamp:        clamp,
    _toAbsMonth:   toAbsMonth,
    _fromAbsMonth: fromAbsMonth,
  };
}));
