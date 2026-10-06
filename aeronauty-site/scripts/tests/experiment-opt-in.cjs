const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

// Run against `next build` + `next start`; dev mode disables route prefetch.
const origin = process.env.OPT_IN_TEST_ORIGIN || 'http://127.0.0.1:5283';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cases = [
  { from: '/projects', to: '/apps/circulation', heading: 'The Circulation Machine', worker: true },
  { from: '/writing', to: '/writing/momentum', heading: 'Newton, for fluids', worker: false },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.OPT_IN_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const results = [];
  try {
    for (const item of cases) {
      const page = await browser.newPage();
      let selected = false;
      const before = [];
      const after = [];
      const workersBefore = [];
      const workersAfter = [];
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = new URL(request.url());
        // The local acceptance test must not send analytics or third-party requests.
        if (url.protocol.startsWith('http') && url.origin !== origin) return request.abort();
        (selected ? after : before).push(url.pathname);
        return request.continue();
      });
      page.on('workercreated', (worker) => (selected ? workersAfter : workersBefore).push(worker.url()));
      await page.goto(origin + item.from, { waitUntil: 'networkidle0' });
      await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'No thanks')?.click());
      const link = await page.waitForSelector(`a[href="${item.to}"]`);
      await link.scrollIntoView();
      await pause(1500);
      await link.hover();
      await pause(500);
      const prefetched = before.filter((path) =>
        path === item.to || path.includes('/chunks/app' + item.to + '/') ||
        path.includes('/foil-core/') || path.includes('/flexfoil-data/') || path.includes('gridWorker'));
      selected = true;
      await link.click();
      await page.waitForFunction((path) => location.pathname === path, {}, item.to);
      await page.waitForFunction((text) => document.querySelector('h1')?.textContent?.includes(text), {}, item.heading);
      if (item.worker) await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0);
      await pause(1500);
      results.push({ ...item, prefetched, workersBefore, workersAfter, after });
      await page.close();
    }
    console.log(JSON.stringify(results, null, 2));
    for (const result of results) {
      assert.deepEqual(result.prefetched, [], result.from + ' downloads experiment assets before selection');
      assert.deepEqual(result.workersBefore, [], result.from + ' starts an experiment worker before selection');
      assert.ok(result.after.some((path) => path === result.to || path.includes('/chunks/app' + result.to + '/')), 'explicit navigation loads experiment');
      if (result.worker) assert.ok(result.workersAfter.length > 0, 'explicit Circulation navigation starts its worker');
    }
    console.log('PASS: both production routes stay idle until navigation; selected experiments load.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
