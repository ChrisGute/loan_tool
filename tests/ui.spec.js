// @ts-check
/**
 * Playwright UI tests for loan_tool (docs/index.html)
 *
 * Covers:
 *  - Page load & nav                        (desktop + mobile)
 *  - Home loan inputs & live recalculation
 *  - Target Payoff Date section
 *  - Sensitivity chart canvas (non-empty pixels, responsive sizing)
 *  - Extra payment slider + preset buttons
 *  - Lump sum panel
 *  - Benchmark comparison card
 *  - Auto loan tab
 *  - Mobile viewport layout (375 × 812)
 *  - No horizontal overflow on narrow screens
 *
 * Run:  npx playwright test tests/ui.spec.js
 */

'use strict';

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../docs/index.html');

// ── Viewports ────────────────────────────────────────────────────────────────
const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 375,  height: 812 };
const TABLET  = { width: 768,  height: 1024 };

// ── Helpers ──────────────────────────────────────────────────────────────────
async function openPage(browser, viewport = DESKTOP) {
  const ctx  = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
  // loan-math.js exposes window.LoanMath; the page assigns const LM = window.LoanMath
  await page.waitForFunction(() => typeof window.LoanMath !== 'undefined', { timeout: 15_000 });
  // Give calcHome/calcAuto a tick to run
  await page.waitForTimeout(200);
  return page;
}

/** Return true if any canvas pixel is non-transparent */
async function canvasHasPixels(page, canvasId) {
  return page.evaluate((id) => {
    const canvas = document.getElementById(id);
    if (!canvas) return false;
    const ctx  = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  }, canvasId);
}

/** Read text content of an element, trimmed */
async function text(page, selector) {
  return (await page.locator(selector).textContent()).trim();
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Page load & basic structure
// ════════════════════════════════════════════════════════════════════════════
test.describe('Page load', () => {
  test('has correct title', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page).toHaveTitle(/Loan Payoff Calculator/);
  });

  test('nav wordmark links to GitHub repo', async ({ browser }) => {
    const page = await openPage(browser);
    const link = page.locator('header a[href*="github.com"]').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveText('loan_tool');
  });

  test('nav has GitHub and LinkedIn icon links', async ({ browser }) => {
    const page = await openPage(browser);
    const ghLink = page.locator('header a[href*="github.com/ChrisGute/loan_tool"]').nth(1);
    const liLink = page.locator('header a[href*="linkedin.com"]');
    await expect(ghLink).toBeVisible();
    await expect(liLink).toBeVisible();
  });

  test('no Log In or Get Started buttons', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page.locator('text=Log In')).toHaveCount(0);
    await expect(page.locator('text=Get Started')).toHaveCount(0);
  });

  test('footer has disclaimer text, no legal links', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page.locator('footer')).toContainText('Financial projections are estimates');
    await expect(page.locator('footer a[href="#"]')).toHaveCount(0);
    await expect(page.locator('footer >> text=Privacy Policy')).toHaveCount(0);
    await expect(page.locator('footer >> text=Terms of Service')).toHaveCount(0);
  });

  test('home loan tab is active on load', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page.locator('#tab-home')).toHaveClass(/active/);
    await expect(page.locator('#tab-auto')).not.toHaveClass(/active/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Home loan inputs & live recalculation
// ════════════════════════════════════════════════════════════════════════════
test.describe('Home loan inputs', () => {
  test('default values produce non-empty summary cards', async ({ browser }) => {
    const page = await openPage(browser);
    // Interest avoided should be a dollar amount
    const avoided = await text(page, '#h-int-avoided');
    expect(avoided).toMatch(/^\$/);
    // Payoff date should be a month + year
    const payoff = await text(page, '#h-payoff-date');
    expect(payoff).toMatch(/\d{4}/);
  });

  test('changing balance recalculates immediately', async ({ browser }) => {
    const page = await openPage(browser);
    const before = await text(page, '#h-int-avoided');

    await page.locator('#h-balance').fill('200,000');
    await page.locator('#h-balance').dispatchEvent('input');
    await page.waitForTimeout(400); // debounce

    const after = await text(page, '#h-int-avoided');
    expect(after).not.toBe(before);
  });

  test('changing interest rate recalculates', async ({ browser }) => {
    const page = await openPage(browser);
    const before = await text(page, '#h-payoff-date');

    await page.locator('#h-rate').fill('7.00');
    await page.locator('#h-rate').dispatchEvent('input');
    await page.waitForTimeout(400);

    // At higher rate with same payment, payoff date moves later — the card value changes
    const after = await text(page, '#h-int-avoided');
    expect(after).not.toBe(before);
  });

  test('total monthly payment is displayed', async ({ browser }) => {
    const page = await openPage(browser);
    const total = await text(page, '#h-total-pmt');
    expect(total).toMatch(/^\$/);
  });

  test('schedule status shows months ahead/behind value', async ({ browser }) => {
    const page = await openPage(browser);
    const months = await text(page, '#h-months-ahead');
    expect(months).toMatch(/[+-]?\d+\s*months?/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Extra payment slider
// ════════════════════════════════════════════════════════════════════════════
test.describe('Extra payment slider', () => {
  test('slider display updates when moved', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#h-extra-slider').fill('500');
    await page.locator('#h-extra-slider').dispatchEvent('input');
    await expect(page.locator('#h-extra-display')).toContainText('500');
  });

  test('+$500 preset button sets slider and recalcs', async ({ browser }) => {
    const page = await openPage(browser);
    const before = await text(page, '#h-int-avoided');

    // Click the +$500 preset
    await page.locator('button', { hasText: '+$500' }).first().click();
    await page.waitForTimeout(100);

    await expect(page.locator('#h-extra-display')).toContainText('500');
    const after = await text(page, '#h-int-avoided');
    expect(after).not.toBe(before);
  });

  test('interest avoided is positive and changes with payment level', async ({ browser }) => {
    const page = await openPage(browser);

    await page.locator('#h-extra-slider').fill('0');
    await page.locator('#h-extra-slider').dispatchEvent('input');
    await page.waitForTimeout(400);
    const low = await text(page, '#h-int-avoided');

    await page.locator('#h-extra-slider').fill('1000');
    await page.locator('#h-extra-slider').dispatchEvent('input');
    await page.waitForTimeout(400);
    const high = await text(page, '#h-int-avoided');

    const parseDollar = s => parseFloat(s.replace(/[$,]/g, '')) || 0;
    // Both should be positive dollar amounts
    expect(parseDollar(low)).toBeGreaterThanOrEqual(0);
    expect(parseDollar(high)).toBeGreaterThan(0);
    // High extra payment should produce at least as much savings as zero
    expect(parseDollar(high)).toBeGreaterThanOrEqual(parseDollar(low));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Target Payoff Date section
// ════════════════════════════════════════════════════════════════════════════
test.describe('Target Payoff Date', () => {
  test('result card is visible on load (always shown)', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page.locator('#h-target-result')).toBeVisible();
  });

  test('result card uses on-theme surface background (no dark gradient)', async ({ browser }) => {
    const page = await openPage(browser);
    const bgColor = await page.locator('#h-target-result').evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );
    // Should NOT be the old navy #001a42 / rgb(0,26,66)
    expect(bgColor).not.toBe('rgb(0, 26, 66)');
    expect(bgColor).not.toContain('gradient');
  });

  test('result card has a thin top accent bar (tertiary-container color)', async ({ browser }) => {
    const page = await openPage(browser);
    // The h-1 accent bar should exist as first child of the result card
    const bar = page.locator('#h-target-result .h-1');
    await expect(bar).toBeVisible();
  });

  test('extra payment needed populates after setting target date', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#h-target-date').fill('2035-06');
    await page.locator('#h-target-date').dispatchEvent('input');
    await page.waitForTimeout(200);

    const extra = await text(page, '#h-req-extra');
    expect(extra).toMatch(/^\$/);
    const total = await text(page, '#h-req-total');
    expect(total).toMatch(/^\$/);
  });

  test('5-year quick button sets target date and solves', async ({ browser }) => {
    const page = await openPage(browser);
    // Use exact match via onclick attribute to avoid "15 yrs" partial match
    await page.locator('button[onclick="setTargetYears(5)"]').click();
    await page.waitForTimeout(200);

    const extra = await text(page, '#h-req-extra');
    expect(extra).toMatch(/^\$/);
    const amount = parseFloat(extra.replace(/[$,]/g, ''));
    expect(amount).toBeGreaterThan(0);
  });

  test('infeasible message shown for past date', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#h-target-date').fill('2020-01');
    await page.locator('#h-target-date').dispatchEvent('input');
    await page.waitForTimeout(200);
    await expect(page.locator('#h-infeasible-msg')).toBeVisible();
  });

  test('infeasible message hidden for valid future date', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#h-target-date').fill('2038-01');
    await page.locator('#h-target-date').dispatchEvent('input');
    await page.waitForTimeout(200);
    await expect(page.locator('#h-infeasible-msg')).toBeHidden();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Sensitivity chart (canvas)
// ════════════════════════════════════════════════════════════════════════════
test.describe('Sensitivity chart (desktop)', () => {
  test('canvas has drawn pixels on load', async ({ browser }) => {
    const page = await openPage(browser, DESKTOP);
    await page.waitForTimeout(300);
    const hasPixels = await canvasHasPixels(page, 'sensitivityCanvas');
    expect(hasPixels).toBe(true);
  });

  test('canvas dimensions match container', async ({ browser }) => {
    const page = await openPage(browser, DESKTOP);
    await page.waitForTimeout(300);
    const { canvasW, containerW } = await page.evaluate(() => {
      const canvas    = document.getElementById('sensitivityCanvas');
      const container = canvas.parentElement;
      return {
        canvasW:    canvas.offsetWidth,
        containerW: container.offsetWidth,
      };
    });
    // Canvas should fill its container (within 2px rounding)
    expect(Math.abs(canvasW - containerW)).toBeLessThanOrEqual(2);
  });

  test('clicking a bar selects that payment amount', async ({ browser }) => {
    const page = await openPage(browser, DESKTOP);
    await page.waitForTimeout(300);

    // Simulate click by calling the exposed setHomeExtra function (same as bar click would do)
    // and verify the slider and display reflect the change
    await page.evaluate(() => window.setHomeExtra(300));
    await page.waitForTimeout(200);

    const sliderVal = parseInt(await page.locator('#h-extra-slider').inputValue());
    expect(sliderVal).toBe(300);
    await expect(page.locator('#h-extra-display')).toContainText('300');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Lump sum panel
// ════════════════════════════════════════════════════════════════════════════
test.describe('Lump sum panel', () => {
  test('lump sum fields are visible', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page.locator('#h-lump')).toBeVisible();
    await expect(page.locator('#h-lump-date')).toBeVisible();
  });

  test('lump sum result cards populate', async ({ browser }) => {
    const page = await openPage(browser);
    await page.waitForTimeout(300);
    const bal     = await text(page, '#h-lump-bal');
    const avoided = await text(page, '#h-lump-avoided');
    expect(bal).toMatch(/^\$/);
    expect(avoided).toMatch(/^\$/);
  });

  test('changing lump amount updates results', async ({ browser }) => {
    const page = await openPage(browser);
    await page.waitForTimeout(300);
    const before = await text(page, '#h-lump-avoided');

    await page.locator('#h-lump').fill('50,000');
    await page.locator('#h-lump').dispatchEvent('input');
    await page.waitForTimeout(400);

    const after = await text(page, '#h-lump-avoided');
    expect(after).not.toBe(before);
    const parseDollar = s => parseFloat(s.replace(/[$,]/g, '')) || 0;
    expect(parseDollar(after)).toBeGreaterThan(parseDollar(before));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Benchmark comparison card
// ════════════════════════════════════════════════════════════════════════════
test.describe('Benchmark comparison', () => {
  test('benchmark verdict card is visible', async ({ browser }) => {
    const page = await openPage(browser);
    await expect(page.locator('#h-bench-result')).toBeVisible();
  });

  test('benchmark verdict changes when rate exceeds loan rate', async ({ browser }) => {
    const page = await openPage(browser);
    await page.waitForTimeout(300);
    const low = await text(page, '#h-bench-result');

    // Set benchmark higher than loan rate (5.5%), invest-is-better scenario
    await page.locator('#h-bench').fill('8.0');
    await page.locator('#h-bench').dispatchEvent('input');
    await page.waitForTimeout(400);

    const high = await text(page, '#h-bench-result');
    expect(high).not.toBe(low);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Auto loan tab
// ════════════════════════════════════════════════════════════════════════════
test.describe('Auto loan tab', () => {
  test('clicking Auto Loans nav shows auto tab', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#nav-auto').click();
    await expect(page.locator('#tab-auto')).toHaveClass(/active/);
    await expect(page.locator('#tab-home')).not.toHaveClass(/active/);
  });

  test('auto tab has default values populated', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#nav-auto').click();
    await page.waitForTimeout(200);
    const avoided = await text(page, '#a-int-avoided');
    expect(avoided).toMatch(/^\$/);
  });

  test('auto canvas has drawn pixels', async ({ browser }) => {
    const page = await openPage(browser, DESKTOP);
    await page.locator('#nav-auto').click();
    await page.waitForTimeout(300);
    const hasPixels = await canvasHasPixels(page, 'autoSensitivityCanvas');
    expect(hasPixels).toBe(true);
  });

  test('auto target date mode toggle works', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#nav-auto').click();
    await page.waitForTimeout(100);

    await page.locator('#a-mode-target').click();
    await expect(page.locator('#a-mode-target-panel')).toBeVisible();
    await expect(page.locator('#a-mode-extra-panel')).toBeHidden();
  });

  test('auto target date result populates', async ({ browser }) => {
    const page = await openPage(browser);
    await page.locator('#nav-auto').click();
    await page.waitForTimeout(100);

    await page.locator('#a-mode-target').click();
    await page.locator('#a-target-date').fill('2028-06');
    await page.locator('#a-target-date').dispatchEvent('change');
    await page.waitForTimeout(200);

    const extra = await text(page, '#a-req-extra');
    expect(extra).toMatch(/^\$|^—/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Mobile viewport (375 × 812)
// ════════════════════════════════════════════════════════════════════════════
test.describe('Mobile layout (375 × 812)', () => {
  test('page loads without JS errors', async ({ browser }) => {
    const errors = [];
    const ctx  = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.LoanMath !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test('no horizontal scroll (no overflow)', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    await page.waitForTimeout(500);
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE.width + 2); // 2px tolerance
  });

  test('home loan inputs are visible and not clipped', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    await expect(page.locator('#h-principal')).toBeVisible();
    await expect(page.locator('#h-balance')).toBeVisible();
    await expect(page.locator('#h-rate')).toBeVisible();
  });

  test('sensitivity chart canvas renders on mobile', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    await page.waitForTimeout(500);
    const hasPixels = await canvasHasPixels(page, 'sensitivityCanvas');
    expect(hasPixels).toBe(true);
  });

  test('chart canvas width fills its container on mobile', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    await page.waitForTimeout(500);
    const { canvasW, containerW } = await page.evaluate(() => {
      const canvas    = document.getElementById('sensitivityCanvas');
      const container = canvas.parentElement;
      return { canvasW: canvas.offsetWidth, containerW: container.offsetWidth };
    });
    expect(Math.abs(canvasW - containerW)).toBeLessThanOrEqual(2);
  });

  test('chart canvas width is less than desktop (responsive)', async ({ browser }) => {
    const desktop = await openPage(browser, DESKTOP);
    await desktop.waitForTimeout(300);
    const desktopW = await desktop.evaluate(() =>
      document.getElementById('sensitivityCanvas').offsetWidth
    );

    const mobile = await openPage(browser, MOBILE);
    await mobile.waitForTimeout(300);
    const mobileW = await mobile.evaluate(() =>
      document.getElementById('sensitivityCanvas').offsetWidth
    );

    expect(mobileW).toBeLessThan(desktopW);
  });

  test('target payoff result card visible and readable on mobile', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    await expect(page.locator('#h-target-result')).toBeVisible();

    // The card should not overflow viewport horizontally
    const { cardRight } = await page.evaluate(() => {
      const rect = document.getElementById('h-target-result').getBoundingClientRect();
      return { cardRight: rect.right };
    });
    expect(cardRight).toBeLessThanOrEqual(MOBILE.width + 4);
  });

  test('key numeric outputs are non-empty on mobile', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    await page.waitForTimeout(300);

    const values = await Promise.all([
      text(page, '#h-int-avoided'),
      text(page, '#h-payoff-date'),
      text(page, '#h-total-pmt'),
    ]);
    values.forEach(v => {
      expect(v.length).toBeGreaterThan(0);
      expect(v).not.toBe('—');
    });
  });

  test('sweet spot card visible on mobile', async ({ browser }) => {
    const page = await openPage(browser, MOBILE);
    const val = await text(page, '#h-sweet-val');
    expect(val).toMatch(/^\$/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Tablet viewport (768 × 1024)
// ════════════════════════════════════════════════════════════════════════════
test.describe('Tablet layout (768 × 1024)', () => {
  test('no horizontal overflow on tablet', async ({ browser }) => {
    const page = await openPage(browser, TABLET);
    await page.waitForTimeout(500);
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(TABLET.width + 2);
  });

  test('chart renders on tablet', async ({ browser }) => {
    const page = await openPage(browser, TABLET);
    await page.waitForTimeout(400);
    const hasPixels = await canvasHasPixels(page, 'sensitivityCanvas');
    expect(hasPixels).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. URL state — shareable links
// ════════════════════════════════════════════════════════════════════════════
test.describe('URL state (shareable links)', () => {
  test('URL params are written after load', async ({ browser }) => {
    const page = await openPage(browser);
    // After calcHome runs, the URL should be updated — wait for it
    await page.waitForFunction(() => location.search.includes('hp='), { timeout: 5000 });
    const url = page.url();
    expect(url).toContain('hp=');   // home principal
    expect(url).toContain('hr=');   // home rate
    expect(url).toContain('hb=');   // home balance
  });

  test('changing a field updates the URL', async ({ browser }) => {
    const page = await openPage(browser);
    await page.waitForFunction(() => location.search.includes('hp='), { timeout: 5000 });

    await page.locator('#h-balance').fill('150,000');
    await page.locator('#h-balance').dispatchEvent('input');
    await page.waitForFunction(() => location.search.includes('hb=150'), { timeout: 5000 });

    expect(page.url()).toContain('hb=150%2C000');
  });

  test('slider value is encoded in URL', async ({ browser }) => {
    const page = await openPage(browser);
    await page.waitForFunction(() => location.search.includes('hp='), { timeout: 5000 });

    // Use a step-valid value (step=100, so 800 is valid)
    await page.locator('#h-extra-slider').fill('800');
    await page.locator('#h-extra-slider').dispatchEvent('input');
    await page.waitForFunction(() => location.search.includes('he=800'), { timeout: 5000 });

    expect(page.url()).toContain('he=800');
  });

  test('URL restores home loan fields on reload', async ({ browser }) => {
    const page = await openPage(browser);

    // Set a distinctive balance
    await page.locator('#h-balance').fill('123456');
    await page.locator('#h-balance').dispatchEvent('input');
    await page.waitForTimeout(400);

    const sharedUrl = page.url();
    expect(sharedUrl).toContain('hb=');

    // Open a new page with that URL
    const ctx2  = await browser.newContext({ viewport: DESKTOP });
    const page2 = await ctx2.newPage();
    await page2.goto(sharedUrl, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => typeof window.LoanMath !== 'undefined', { timeout: 15_000 });
    await page2.waitForTimeout(300);

    const restoredBalance = await page2.locator('#h-balance').inputValue();
    expect(restoredBalance).toBe('123456');
  });

  test('URL restores auto tab and mode', async ({ browser }) => {
    const page = await openPage(browser);

    // Switch to auto tab, target mode
    await page.locator('#nav-auto').click();
    await page.locator('#a-mode-target').click();
    await page.waitForTimeout(200);

    const sharedUrl = page.url();
    expect(sharedUrl).toContain('tab=auto');
    expect(sharedUrl).toContain('am=target');

    // Open fresh page with that URL
    const ctx2  = await browser.newContext({ viewport: DESKTOP });
    const page2 = await ctx2.newPage();
    await page2.goto(sharedUrl, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => typeof window.LoanMath !== 'undefined', { timeout: 15_000 });
    await page2.waitForTimeout(300);

    await expect(page2.locator('#tab-auto')).toHaveClass(/active/);
    await expect(page2.locator('#a-mode-target-panel')).toBeVisible();
  });

  test('direct URL with custom rate produces correct calculations', async ({ browser }) => {
    // Build a URL with a 7% rate directly
    const ctx  = await browser.newContext({ viewport: DESKTOP });
    const page = await ctx.newPage();
    const url  = FILE_URL + '?tab=home&hp=400%2C000&hr=7.00&ht=360&hb=380%2C000&hd=2026-01&hs=2024-01&he=0&hbn=5.0';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.LoanMath !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(300);

    // Rate field should be 7.00
    const rate = await page.locator('#h-rate').inputValue();
    expect(rate).toBe('7.00');

    // Calculations should have run — interest avoided should be a dollar value
    const avoided = await text(page, '#h-int-avoided');
    expect(avoided).toMatch(/^\$/);
  });
});

