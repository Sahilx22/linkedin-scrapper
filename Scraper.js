const { chromium } = require("playwright");
const fs = require("fs");
const config = require("./config.json");

const OUTPUT_FILE  = "linkedin_posts.json";
const CSV_FILE     = "linkedin_posts.csv";
const TARGET_POSTS = config.targetPosts || 500;
const SEARCH_URL   =
  "https://www.linkedin.com/search/results/content/?keywords=%22python%20developer%22%20remote%20%222%20years%22&origin=GLOBAL_SEARCH_HEADER&sid=3xx&sortBy=%22date_posted%22";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min = 1500, max = 3500) {
  return sleep(Math.floor(Math.random() * (max - min) + min));
}
function saveJSON(posts) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2), "utf-8");
  console.log(`💾 Auto-saved ${posts.length} posts → ${OUTPUT_FILE}`);
}
function saveCSV(posts) {
  const headers = ["id","author","authorHeadline","timestamp","content","likes","comments","reposts","postUrl"];
  const rows = posts.map(p =>
    headers.map(h => `"${String(p[h]||"").replace(/"/g,'""')}"`).join(",")
  );
  fs.writeFileSync(CSV_FILE, [headers.join(","), ...rows].join("\n"), "utf-8");
  console.log(`📊 Saved CSV → ${CSV_FILE}`);
}

// ── Count how many post cards are currently in DOM ─────────────────────────
async function countCards(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll("div[role='listitem']")]
      .filter(el => el.innerText?.includes("Feed post") || el.innerText?.trim().length > 80)
      .length
  );
}

// ── Extract ALL cards currently visible in DOM ─────────────────────────────
async function extractAll(page) {
  return await page.evaluate(() => {
    const results = [];
    const cards = [...document.querySelectorAll("div[role='listitem']")]
      .filter(el => el.innerText?.includes("Feed post") || el.innerText?.trim().length > 80);

    cards.forEach((card, idx) => {
      try {
        const fullText = card.innerText || "";
        if (fullText.trim().length < 30) return;

        // ── Content: pick longest <p> block ───────────────────────────
        const paragraphs = [...card.querySelectorAll("p")]
          .map(p => p.innerText?.trim())
          .filter(t => t && t.length > 30);
        const spans = [...card.querySelectorAll("span")]
          .map(s => s.innerText?.trim())
          .filter(t => t && t.length > 60 && !t.startsWith("Follow") && !t.startsWith("Connect"));

        let content = "";
        if (paragraphs.length > 0) {
          content = paragraphs.sort((a, b) => b.length - a.length)[0];
        } else if (spans.length > 0) {
          content = spans.sort((a, b) => b.length - a.length)[0];
        }
        if (!content || content.length < 20) return;

        // ── Author ────────────────────────────────────────────────────
        const links = [...card.querySelectorAll("a")];
        let author = "";
        let postUrl = "";
        for (const a of links) {
          const href = a.href || "";
          const text = a.innerText?.trim() || "";
          if (href.includes("/in/") && text.length > 1 && text.length < 80 && !text.includes("\n")) {
            author = text; break;
          }
        }
        if (!author) {
          const lines = fullText.split("\n").map(l => l.trim()).filter(Boolean);
          const fi = lines.findIndex(l => l === "Feed post");
          if (fi >= 0 && lines[fi + 1]) author = lines[fi + 1];
        }

        // ── Post URL ──────────────────────────────────────────────────
        for (const a of links) {
          const href = a.href || "";
          if (href.includes("/feed/update/") || href.includes("activity") || href.includes("/posts/")) {
            postUrl = href; break;
          }
        }

        // ── Timestamp ─────────────────────────────────────────────────
        const timeEl = card.querySelector("time");
        const timestamp = timeEl
          ? (timeEl.getAttribute("datetime") || timeEl.innerText?.trim() || "")
          : (fullText.match(/(\d+[mhd])\s*•/)?.[1] || "");

        // ── Headline ──────────────────────────────────────────────────
        const shortParas = [...card.querySelectorAll("p")]
          .map(p => p.innerText?.trim())
          .filter(t => t && t.length > 5 && t.length < 150 && t !== author);
        const authorHeadline = shortParas[0] || "";

        // ── Engagement ────────────────────────────────────────────────
        const reactionEl = card.querySelector("[aria-label*='reaction'],[aria-label*='like']");
        const likes = reactionEl
          ? (reactionEl.getAttribute("aria-label")?.match(/(\d[\d,]*)/)?.[1] || reactionEl.innerText?.trim() || "0")
          : (fullText.match(/(\d[\d,]*)\s*reaction/i)?.[1] || "0");

        const commentEl = card.querySelector("[aria-label*='comment']");
        const comments = commentEl
          ? (commentEl.getAttribute("aria-label")?.match(/(\d[\d,]*)/)?.[1] || commentEl.innerText?.trim() || "0")
          : (fullText.match(/(\d[\d,]*)\s*comment/i)?.[1] || "0");

        const repostEl = card.querySelector("[aria-label*='repost']");
        const reposts = repostEl
          ? (repostEl.getAttribute("aria-label")?.match(/(\d[\d,]*)/)?.[1] || repostEl.innerText?.trim() || "0")
          : (fullText.match(/(\d[\d,]*)\s*repost/i)?.[1] || "0");

        const id = card.getAttribute("data-urn")
          || card.getAttribute("id")
          || `post_${idx}_${content.slice(0,20).replace(/\W/g,"_")}`;

        results.push({ id, author, authorHeadline, timestamp, content, likes, comments, reposts, postUrl });
      } catch (_) {}
    });

    return results;
  });
}

function dedupe(posts) {
  const seen = new Set();
  return posts.filter(p => {
    const key = p.content?.slice(0, 100);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  console.log("🚀 LinkedIn Scraper — Scroll-First Mode");
  console.log(`🎯 Target: ${TARGET_POSTS} posts\n`);

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
  await page.fill("#username", config.email);
  await randomDelay(500, 1000);
  await page.fill("#password", config.password);
  await randomDelay(500, 1000);
  await page.click('[type="submit"]');
  try { await page.waitForURL(/linkedin\.com\/(feed|checkpoint)/, { timeout: 20000 }); }
  catch { await sleep(10000); }
  if (page.url().includes("checkpoint")) {
    console.log("⚠️  Complete verification in browser. Waiting 60s...");
    await page.waitForURL(/linkedin\.com\/feed/, { timeout: 60000 });
  }
  console.log("✅ Logged in!\n");
  await randomDelay(2000, 3000);

  // ── Navigate ──────────────────────────────────────────────────────────
  console.log("🔍 Loading search page...");
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector("div[role='listitem']", { timeout: 15000 });
  } catch { /* proceed anyway */ }
  await sleep(4000);
  console.log("✅ Page loaded!\n");

  // ── SCROLL-FIRST LOOP ─────────────────────────────────────────────────
  // Strategy:
  //   1. Scroll down a bit (human-like, small steps)
  //   2. Wait for LinkedIn to load NEW cards into DOM
  //   3. Extract only after card count increases
  //   4. Repeat until we have enough posts

  let allPosts    = [];
  let scrollRound = 0;
  let stuckCount  = 0;
  const MAX_STUCK = 5; // stop if DOM doesn't grow after 5 scroll attempts

  console.log("📜 Scrolling and collecting posts...\n");

  while (allPosts.length < TARGET_POSTS && stuckCount < MAX_STUCK) {
    scrollRound++;

    const cardsBefore = await countCards(page);

    // ── Scroll down in small human-like steps ──────────────────────────
    const scrollSteps = Math.floor(Math.random() * 3) + 2; // 2-4 steps
    for (let s = 0; s < scrollSteps; s++) {
      const amount = Math.floor(Math.random() * 400) + 300; // 300-700px
      await page.evaluate(px => window.scrollBy(0, px), amount);
      await sleep(Math.floor(Math.random() * 600) + 400); // 400-1000ms between steps
    }

    // ── Click "Show more results" if present ───────────────────────────
    try {
      const btn = await page.$("button:has-text('Show more results')");
      if (btn) {
        await btn.click();
        console.log(`  ▶ Clicked 'Show more results'`);
        await sleep(3000);
      }
    } catch (_) {}

    // ── Wait for NEW cards to appear in DOM ────────────────────────────
    // Poll every 500ms for up to 8 seconds
    let cardsAfter = cardsBefore;
    for (let wait = 0; wait < 16; wait++) {
      await sleep(500);
      cardsAfter = await countCards(page);
      if (cardsAfter > cardsBefore) break;
    }

    // ── Extract all posts from DOM ─────────────────────────────────────
    const freshPosts = await extractAll(page);
    const before = allPosts.length;
    allPosts = dedupe([...allPosts, ...freshPosts]);
    const added = allPosts.length - before;

    console.log(
      `  Scroll ${scrollRound}: DOM cards ${cardsBefore}→${cardsAfter} | ` +
      `extracted ${freshPosts.length} | +${added} new | total ${allPosts.length}/${TARGET_POSTS}`
    );

    if (cardsAfter === cardsBefore && added === 0) {
      stuckCount++;
      console.log(`  ⏳ DOM not growing (${stuckCount}/${MAX_STUCK}) — waiting longer...`);
      await sleep(4000); // extra wait before next scroll
    } else {
      stuckCount = 0;
    }

    // Auto-save every 50 posts
    if (allPosts.length > 0 && allPosts.length % 50 === 0) {
      saveJSON(allPosts);
    }

    if (allPosts.length >= TARGET_POSTS) break;

    // Human-like pause between scroll rounds
    await randomDelay(1500, 3000);
  }

  // ── Final save ────────────────────────────────────────────────────────
  console.log(`\n✅ Done! Collected ${allPosts.length} posts.`);
  saveJSON(allPosts);
  saveCSV(allPosts);
  await browser.close();
  console.log("🎉 Complete! Check linkedin_posts.json and linkedin_posts.csv");
})();