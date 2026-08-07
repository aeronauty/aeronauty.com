import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

const APP_PATH = "/apps/tile-tally";
const MANIFEST_PATH = "/tile-tally.webmanifest";

test("publishes installable metadata and correctly sized app icons", async ({ page, request }) => {
  const manifestResponse = await request.get(MANIFEST_PATH);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");

  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: APP_PATH,
    name: "Aeronauty Game Ledger",
    short_name: "Game Ledger",
    start_url: APP_PATH,
    scope: APP_PATH,
    display: "standalone",
    orientation: "any",
    background_color: "#eef2f7",
    theme_color: "#17243b",
    prefer_related_applications: false,
  });

  const rasterIcons = manifest.icons.filter(
    (icon: { type?: string; purpose?: string }) => icon.type === "image/png" && icon.purpose === "any",
  );
  expect(rasterIcons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(
    manifest.icons.some(
      (icon: { sizes?: string; purpose?: string }) =>
        icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
  ).toBe(true);

  for (const icon of rasterIcons) {
    const response = await request.get(icon.src);
    expect(response.ok(), `${icon.src} should be reachable`).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");

    const png = await response.body();
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const [expectedWidth, expectedHeight] = icon.sizes.split("x").map(Number);
    expect(png.readUInt32BE(16)).toBe(expectedWidth);
    expect(png.readUInt32BE(20)).toBe(expectedHeight);
  }

  await page.goto(APP_PATH);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", MANIFEST_PATH);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#17243b");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "Game Ledger",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/tile-tally-apple-touch-icon.png",
  );
});

test("registers a narrowly scoped worker that caches only approved static assets", async ({ page }) => {
  await page.goto(APP_PATH);

  await expect
    .poll(() =>
      page.evaluate(async (appPath) => {
        const registration = await navigator.serviceWorker.getRegistration(appPath);
        return registration?.active?.scriptURL ?? null;
      }, APP_PATH),
    )
    .toContain("/tile-tally-sw.js");

  const registrationScope = await page.evaluate(async (appPath) => {
    const registration = await navigator.serviceWorker.getRegistration(appPath);
    return registration?.scope ?? null;
  }, APP_PATH);
  expect(new URL(registrationScope!).pathname).toBe(APP_PATH);

  // The first load installs the worker; the reload places this page under its control.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const cacheProbe = await page.evaluate(async () => {
    const cachePrefix = "tile-tally-static-";
    const oldKeys = (await caches.keys()).filter((key) => key.startsWith(cachePrefix));
    await Promise.all(oldKeys.map((key) => caches.delete(key)));

    const suffix = crypto.randomUUID();
    const staticUrl = `/tile-tally-icon-192.png?probe=${suffix}`;
    const manifestUrl = `/tile-tally.webmanifest?probe=${suffix}`;
    const navigationUrl = `/apps/tile-tally?probe=${suffix}`;
    const apiUrl = `/api/tile-tally/pwa-cache-probe?probe=${suffix}`;

    await Promise.all([fetch(staticUrl), fetch(manifestUrl), fetch(navigationUrl), fetch(apiUrl)]);

    return {
      cacheKeys: (await caches.keys()).filter((key) => key.startsWith(cachePrefix)),
      cachedStatic: Boolean(await caches.match(staticUrl)),
      cachedManifest: Boolean(await caches.match(manifestUrl)),
      cachedNavigation: Boolean(await caches.match(navigationUrl)),
      cachedApi: Boolean(await caches.match(apiUrl)),
    };
  });

  expect(cacheProbe.cacheKeys).toEqual(["tile-tally-static-v1"]);
  expect(cacheProbe.cachedStatic).toBe(true);
  expect(cacheProbe.cachedManifest).toBe(false);
  expect(cacheProbe.cachedNavigation).toBe(false);
  expect(cacheProbe.cachedApi).toBe(false);
});
