import { access } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { publicTopologyRuntimeAssets } from "../lib/topology-public-assets";

// Each legacy article streams several large videos; loading both at once makes
// mobile WebKit evict or restart the iframe before navigation assertions run.
test.describe.configure({ mode: "serial" });

const assetPrefix = "/writing/topology-instinct/assets";
const packageRoot = path.join(
  process.cwd(),
  "content",
  "private",
  "topology-instinct",
);

test("the public topology asset manifest contains only files that exist", async () => {
  await Promise.all(
    publicTopologyRuntimeAssets.map((asset) => access(path.join(packageRoot, asset))),
  );
});

test("published methodology is available while editorial files stay private", async ({
  request,
}) => {
  const methodology = await request.get(`${assetPrefix}/data/README.md`);
  expect(methodology.status()).toBe(200);
  expect(methodology.headers()["content-type"]).toContain("text/markdown");
  expect(await methodology.text()).toContain("provenance and methodology");

  for (const privateAsset of [
    "delivery_summary.md",
    "runway-prompts.md",
    "data/build.py",
  ]) {
    const response = await request.get(`${assetPrefix}/${privateAsset}`);
    expect(response.status()).toBe(404);
  }
});

test("legacy article links escape the iframe", async ({ page, request }) => {
  // Warm the destination in next dev so WebKit is not interrupted by the
  // one-time Fast Refresh triggered while that route compiles.
  await request.get("/");
  await page.goto("/writing/i-dont-like-data-entry");

  const declineAnalytics = page.getByRole("button", { name: "No thanks" });
  if (await declineAnalytics.isVisible()) {
    await declineAnalytics.click();
  }

  const article = page.frameLocator('iframe[title="I Don\'t Like Data Entry"]');
  const home = article.getByRole("link", { name: "Aeronauty", exact: true }).first();
  const external = article.getByRole("link", { name: "Cascade", exact: true });

  await expect(home).toHaveAttribute("target", "_top");
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /\bnoopener\b/);

  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("iframe")).toHaveCount(0);
});

for (const deepLink of [
  {
    route: "/writing/i-dont-like-data-entry#paradigm",
    frameTitle: "I Don't Like Data Entry",
    targetId: "paradigm",
  },
  {
    route: "/writing/the-brain-that-was-a-tax#problem-class",
    frameTitle: "The Brain That Was a Tax Is Now an Asset",
    targetId: "problem-class",
  },
]) {
  test(`forwards ${deepLink.targetId} into its embedded article`, async ({ page }) => {
    await page.goto(deepLink.route);

    const declineAnalytics = page.getByRole("button", { name: "No thanks" });
    if (await declineAnalytics.isVisible()) {
      await declineAnalytics.click();
    }

    const article = page.frameLocator(`iframe[title="${deepLink.frameTitle}"]`);
    const target = article.locator(`#${deepLink.targetId}`);
    await expect(target).toBeVisible();

    await expect
      .poll(() => article.locator("body").evaluate(() => window.location.hash))
      .toBe(`#${deepLink.targetId}`);
    await expect
      .poll(() =>
        target.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < window.innerHeight;
        }),
      )
      .toBe(true);
  });
}
