# loan_tool

**[Try it live → https://chrisgute.github.io/loan_tool/](https://chrisgute.github.io/loan_tool/)**

A browser-based loan payoff optimizer for mortgages and auto loans. No server, no login, no tracking — runs entirely in your browser.

---

## What it does

Enter your loan details once, then instantly see:

- **Current snapshot** — exact balance, interest paid to date, and how far ahead (or behind) you are vs. the original amortization schedule
- **Extra payment analysis** — drag a slider from $0 to $2,000/mo extra and watch the payoff date and total interest saved update in real time
- **Sensitivity chart** — bar chart showing interest saved at every extra-payment level; click any bar to lock in that scenario
- **Sweet spot detector** — finds the inflection point where additional dollars stop buying meaningful time savings (marginal benefit curve)
- **Target date solver** — pick a payoff date (or use the quick buttons: 5 / 6 / 8 / 10 / 15 / 20 years) and it back-solves the exact monthly extra payment required
- **Lump sum impact** — model a one-time principal paydown and see the new payoff timeline
- **Benchmark comparison** — compares prepaying vs. investing at a specified return rate so you can decide where extra dollars belong

Supports both **home loans** and **auto loans**.

---

## Running locally

Just open `docs/index.html` in any modern browser. No build step, no npm install.

```
open docs/index.html
```

The page loads `loan-math.js` from the same directory via a relative `<script src="loan-math.js">` tag.

---

## Project layout

```
docs/
  index.html        — the full single-page tool
  loan-math.js      — pure JS math library (no dependencies)
tests/
  loan-math.test.js — 88 tests, runs in Node
README.md
```

### Running the tests

Requires Node.js (any version ≥ 16).

```
node tests/loan-math.test.js
```

Expected output:

```
ALL 88 TESTS PASSED
```

---

## Math library API (`docs/loan-math.js`)

The library is also usable directly in Node (CommonJS `require`) or in the browser as a global `LM` object.

| Function | Description |
|---|---|
| `monthlyPayment(P, annualRate, termMonths)` | Standard PMT formula |
| `scheduledBalance(P, annualRate, termMonths, k)` | Balance after k payments on schedule |
| `remainingMonths(balance, annualRate, payment)` | Months to payoff at given payment |
| `remainingInterest(balance, annualRate, payment)` | Total future interest at given payment |
| `driftAnalysis(loan)` | Compare actual balance vs. scheduled; returns months ahead/behind and dollar drift |
| `sensitivitySeries(loan, maxExtra, step)` | Array of {extra, payoffDate, interestSaved} across a payment range |
| `sweetSpotAnalysis(series)` | Finds marginal-benefit inflection point in a sensitivity series |
| `solveForTargetDate(loan, targetDate)` | Binary-search for the extra payment that hits a target payoff month |
| `lumpSumImpact(loan, lumpSum)` | New payoff timeline after a one-time principal payment |
| `benchmarkComparison(loan, extraPayment, investmentRate)` | NPV comparison: prepay vs. invest |
| `fullSnapshot(loan)` | All of the above in one call |

---

## License

MIT
