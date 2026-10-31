const { chromium } = require("playwright");
const fs = require("fs");
const config = require("./config.json");

const OUTPUT_FILE  = "linkedin_posts.json";
const CSV_FILE     = "linkedin_posts.csv";
const TARGET_POSTS = config.targetPosts || 500;
const SEARCH_URL   ="https://www.linkedin.com/search/results/content/?keywords=%22Data%20Analyst%22AND%20%22fresher%22&origin=SWITCH_SEARCH_VERTICAL";

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

  // ── Login (manual) ───────────────────────────────────────────────────────
  console.log("🔐 Opening LinkedIn login — log in manually in the browser window...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  try {
    await page.waitForURL(/linkedin\.com\/feed/, { timeout: 5 * 60 * 1000 });
  } catch {
    throw new Error("Timed out waiting for manual login (5 min). Re-run and log in sooner.");
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

  // ── AUTO-SCROLL LOOP ──────────────────────────────────────────────────
  // Strategy:
  //   1. Jump to absolute page bottom  → triggers LinkedIn's scroll observer
  //   2. Nudge a few more pixels       → ensures the threshold fires
  //   3. Poll for new DOM cards        → up to 12s before giving up this round
  //   4. If stuck: scroll up then back → resets LinkedIn's IntersectionObserver
  //   5. Click "Show more" if present  → handles paginated search results
  //   6. Repeat until target reached

  let allPosts    = [];
  let scrollRound = 0;
  let stuckCount  = 0;
  const MAX_STUCK = 8;

  // helper — simulate real mouse-wheel scroll (fires LinkedIn's IntersectionObserver)
  const wheelScroll = async (totalPx, stepPx = 500) => {
    const steps = Math.ceil(totalPx / stepPx);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, stepPx);
      await sleep(120);
    }
  };

  // helper — try every known "load more" button variant
  const clickShowMore = async () => {
    const selectors = [
      "button:has-text('Show more results')",
      "button:has-text('See more results')",
      "button:has-text('Load more')",
    ];
    for (const sel of selectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          console.log(`  ▶ Clicked load-more button`);
          await sleep(3000);
          return true;
        }
      } catch (_) {}
    }
    return false;
  };

  console.log("📜 Auto-scrolling and collecting posts...\n");

  // Move mouse to centre of page so wheel events are received
  await page.mouse.move(720, 450);

  while (allPosts.length < TARGET_POSTS && stuckCount < MAX_STUCK) {
    scrollRound++;
    const cardsBefore = await countCards(page);

    // ── Wheel-scroll down (~3 viewport heights) ────────────────────────
    await wheelScroll(2700, 500);

    // ── Click "Show more" if LinkedIn paginated instead of infinite ─────
    await clickShowMore();

    // ── Poll up to 12s for new cards ───────────────────────────────────
    let cardsAfter = cardsBefore;
    for (let wait = 0; wait < 24; wait++) {
      await sleep(500);
      cardsAfter = await countCards(page);
      if (cardsAfter > cardsBefore) break;
    }

    // ── Unstick: wheel up then back down to reset observer ─────────────
    if (cardsAfter === cardsBefore) {
      console.log(`  ↩ Unsticking — scrolling up then back down...`);
      await wheelScroll(-1500, 500);   // scroll up
      await sleep(800);
      await wheelScroll(2500, 500);   // scroll back down
      await sleep(2000);
      cardsAfter = await countCards(page);
    }

    // ── Extract and deduplicate ────────────────────────────────────────
    const freshPosts = await extractAll(page);
    const before = allPosts.length;
    allPosts = dedupe([...allPosts, ...freshPosts]);
    const added = allPosts.length - before;

    console.log(
      `  Round ${scrollRound}: cards ${cardsBefore}→${cardsAfter} | ` +
      `extracted ${freshPosts.length} | +${added} new | total ${allPosts.length}/${TARGET_POSTS}`
    );

    if (cardsAfter === cardsBefore && added === 0) {
      stuckCount++;
      console.log(`  ⏳ DOM not growing (${stuckCount}/${MAX_STUCK}) — waiting longer...`);
      await sleep(5000);
    } else {
      stuckCount = 0;
    }

    // Auto-save every 50 posts
    if (allPosts.length > 0 && allPosts.length % 50 === 0) {
      saveJSON(allPosts);
    }

    if (allPosts.length >= TARGET_POSTS) break;

    await randomDelay(800, 1800);
  }

  // ── Final save ────────────────────────────────────────────────────────
  console.log(`\n✅ Done! Collected ${allPosts.length} posts.`);
  saveJSON(allPosts);
  saveCSV(allPosts);
  await browser.close();
  console.log("🎉 Complete! Check linkedin_posts.json and linkedin_posts.csv");
})();