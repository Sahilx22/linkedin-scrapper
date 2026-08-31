const { chromium } = require("playwright");
const fs = require("fs");
const config = require("./config.json");

const SEARCH_URL   = "https://www.linkedin.com/search/results/people/?keywords=Data%20Analyst&origin=SWITCH_SEARCH_VERTICAL";
const HTML_DUMP     = "page_dump.html";
const TEXT_DUMP      = "page_dump.txt";
const SCROLL_ROUNDS = 12;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min = 800, max = 1800) {
  return sleep(Math.floor(Math.random() * (max - min) + min));
}

// ── MAIN ──────────────────────────────────────────────────────────────────
// This script does not try to guess LinkedIn's DOM structure at all — it just
// logs in, loads the search page, scrolls to load as much as possible, and
// dumps the raw HTML + visible text to disk. Parsing/filtering happens
// separately in filter_profiles.py against the saved dump, so it can be
// iterated on without re-triggering LinkedIn every time.
(async () => {
  console.log("🚀 LinkedIn Page Dumper");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();

  // ── Login ─────────────────────────────────────────────────────────────
  console.log("🔐 Logging in...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  await randomDelay(1500, 2500);
  const loginInputs = await page.locator("input:visible").all();
  await loginInputs[0].fill(config.email);
  await randomDelay(500, 1000);
  await loginInputs[1].fill(config.password);
  await randomDelay(500, 1000);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try { await page.waitForURL(/linkedin\.com\/(feed|checkpoint)/, { timeout: 20000 }); }
  catch { await sleep(10000); }
  if (page.url().includes("checkpoint")) {
    console.log("⚠️  Complete verification in browser. Waiting 60s...");
    await page.waitForURL(/linkedin\.com\/feed/, { timeout: 60000 });
  }
  console.log("✅ Logged in!\n");
  await randomDelay(2000, 3000);

  // ── Navigate to search results ───────────────────────────────────────
  console.log("🔍 Loading search results page...");
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

  const foundLinks = await page
    .waitForSelector('a[href*="/in/"]', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  console.log(foundLinks
    ? "✅ Results loaded (profile links detected)."
    : "⚠️  No profile links detected yet after 15s — dumping whatever is on the page anyway.");
  await sleep(2000);

  // ── Scroll to load as much lazy content as possible ─────────────────────
  console.log(`📜 Scrolling ${SCROLL_ROUNDS} rounds to load more results...`);
  await page.mouse.move(720, 450);
  for (let i = 1; i <= SCROLL_ROUNDS; i++) {
    await page.mouse.wheel(0, 1800);
    await sleep(1200);
    if (i % 4 === 0) console.log(`  scrolled ${i}/${SCROLL_ROUNDS}`);
  }
  await sleep(1500);

  // ── Dump everything ──────────────────────────────────────────────────
  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText);

  fs.writeFileSync(HTML_DUMP, html, "utf-8");
  fs.writeFileSync(TEXT_DUMP, text, "utf-8");

  console.log(`\n💾 Saved full HTML → ${HTML_DUMP} (${(html.length / 1024).toFixed(0)} KB)`);
  console.log(`💾 Saved visible text → ${TEXT_DUMP} (${(text.length / 1024).toFixed(0)} KB)`);

  await browser.close();
  console.log("🎉 Done. Now run: python filter_profiles.py");
})();
