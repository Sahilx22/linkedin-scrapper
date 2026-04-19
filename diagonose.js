/**
 * DEEP DIAGNOSTIC — finds posts using DOM structure, not class names
 * Run: node diagnose.js
 */
const { chromium } = require("playwright");
const fs = require("fs");
const config = require("./config.json");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const SEARCH_URL =
  "https://www.linkedin.com/search/results/content/?keywords=python%20developer&origin=FACETED_SEARCH&sid=%3B2e&sortBy=%22date_posted%22";

(async () => {
  console.log("🔬 Deep DOM Diagnostic\n");

  const browser = await chromium.launch({ headless: false, slowMo: 50, args: ["--no-sandbox", "--start-maximized"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Login
  console.log("🔐 Logging in...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.fill("#username", config.email);
  await sleep(500);
  await page.fill("#password", config.password);
  await sleep(500);
  await page.click('[type="submit"]');
  try { await page.waitForURL(/linkedin\.com\/(feed|checkpoint)/, { timeout: 20000 }); } catch { await sleep(10000); }
  if (page.url().includes("checkpoint")) {
    console.log("⚠️  Complete verification. Waiting 60s...");
    await page.waitForURL(/linkedin\.com\/feed/, { timeout: 60000 });
  }
  console.log("✅ Logged in!\n");
  await sleep(3000);

  // Go to search
  console.log("🔍 Loading search page...");
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

  // Wait and scroll to trigger lazy loading
  await sleep(5000);
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(3000);
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(3000);

  // Deep structural analysis
  const report = await page.evaluate(() => {
    // 1. Find the main content area
    const main = document.querySelector("main, div[role='main'], #main-content");

    // 2. Get all <li> elements in main
    const allLis = main ? [...main.querySelectorAll("li")] : [...document.querySelectorAll("li")];

    // 3. For each li, check if it looks like a post (has substantial text)
    const postLikes = allLis
      .filter(li => li.innerText && li.innerText.trim().length > 50)
      .slice(0, 5)
      .map(li => ({
        classes: li.className,
        textSnippet: li.innerText.trim().slice(0, 150),
        childTagNames: [...li.children].map(c => c.tagName + (c.className ? "." + c.className.split(" ")[0] : "")),
        hasTime: !!li.querySelector("time"),
        timeDateTime: li.querySelector("time")?.getAttribute("datetime"),
        dataAttrs: [...li.attributes]
          .filter(a => a.name.startsWith("data-"))
          .map(a => `${a.name}="${a.value}"`),
        linkHrefs: [...li.querySelectorAll("a")]
          .map(a => a.href)
          .filter(h => h.includes("linkedin"))
          .slice(0, 3),
        imgAlts: [...li.querySelectorAll("img")]
          .map(i => i.alt)
          .filter(Boolean)
          .slice(0, 2),
      }));

    // 4. Also scan all divs with role=article or similar
    const articles = [...document.querySelectorAll("article, [role='article'], [role='listitem']")]
      .slice(0, 3)
      .map(el => ({
        tag: el.tagName,
        role: el.getAttribute("role"),
        classes: el.className,
        textSnippet: el.innerText?.trim().slice(0, 100),
      }));

    // 5. Check for shadow DOM or iframes
    const iframes = [...document.querySelectorAll("iframe")].map(f => f.src);

    // 6. Dump full li class list
    const allLiClasses = allLis.map(li => li.className).filter(Boolean);

    // 7. Look for ANY element containing post-like text patterns
    const textPatterns = ["hiring", "python", "developer", "years experience"];
    const textMatches = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let count = 0;
    while ((node = walker.nextNode()) && count < 5) {
      const text = node.textContent.trim();
      if (text.length > 40 && textPatterns.some(p => text.toLowerCase().includes(p))) {
        const parent = node.parentElement;
        textMatches.push({
          text: text.slice(0, 100),
          parentTag: parent?.tagName,
          parentClass: parent?.className?.slice(0, 80),
          grandparentTag: parent?.parentElement?.tagName,
          grandparentClass: parent?.parentElement?.className?.slice(0, 80),
        });
        count++;
      }
    }

    return {
      mainFound: !!main,
      totalLis: allLis.length,
      postLikeLis: postLikes,
      articles,
      iframes,
      allLiClasses: [...new Set(allLiClasses)].slice(0, 10),
      textMatches,
    };
  });

  fs.writeFileSync("diagnostic_report.json", JSON.stringify(report, null, 2));

  console.log(`\n📊 RESULTS:`);
  console.log(`  Main element found: ${report.mainFound}`);
  console.log(`  Total <li> elements: ${report.totalLis}`);
  console.log(`  Post-like <li> elements: ${report.postLikeLis.length}`);
  console.log(`  Articles found: ${report.articles.length}`);
  console.log(`  Iframes: ${report.iframes.length}`);

  if (report.postLikeLis.length > 0) {
    console.log(`\n✅ POST-LIKE <li> ELEMENTS FOUND!`);
    report.postLikeLis.forEach((li, i) => {
      console.log(`\n  [Post ${i + 1}]`);
      console.log(`    Classes: ${li.classes}`);
      console.log(`    Text: "${li.textSnippet}"`);
      console.log(`    Data attrs: ${li.dataAttrs.join(", ") || "none"}`);
      console.log(`    Has time: ${li.hasTime} (${li.timeDateTime || "no datetime"})`);
      console.log(`    Links: ${li.linkHrefs.join(", ")}`);
    });
  }

  if (report.textMatches.length > 0) {
    console.log(`\n✅ TEXT MATCHES FOUND IN DOM:`);
    report.textMatches.forEach((m, i) => {
      console.log(`\n  [Match ${i + 1}] "${m.text}"`);
      console.log(`    Parent: <${m.parentTag} class="${m.parentClass}">`);
      console.log(`    Grandparent: <${m.grandparentTag} class="${m.grandparentClass}">`);
    });
  }

  console.log(`\n💾 Full report: diagnostic_report.json`);
  console.log(`\n📋 Copy ALL output above and share it!`);

  await sleep(5000);
  await browser.close();
})();