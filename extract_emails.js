const fs = require("fs");

const EMAIL_REGEX = /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.(com|in|org|net|edu|gov|io|co|uk|ca|au|de|fr|jp|cn|ru|br|mx|it|es|nl|se|ch|be|at|nz|sg|hk|ae|sa|za|kr|tw|th|vn|ph|id|my|pk|bd|lk|ng|ke|eg|tr|il|no|dk|fi|gr|pt|cz|pl|ro|ua|bg|hr|sk|hu|si|lt|lv|ee|is|ie|il|mx|ar|cl|co|ve|pe|uy|bo|py|ec|gy|sr|fk|gl|pm|re|mu|sc|km|dz|tn|ly|sd|et|sd|dj|so|er|jm|bs|bb|tt|ky|ag|vc|lc|dm|gd|kn|ai|vg|tc|ms|bm|gi)/gi;

const HIRING_KEYWORDS = [
  "hiring", "we'?re hiring", "we are hiring", "now hiring",
  "job opening", "job opportunity", "job alert", "job post",
  "open position", "open role", "vacancy", "vacancies",
  "looking for", "seeking a", "seeking an", "in search of",
  "join our team", "join us", "be part of",
  "apply now", "apply here", "send your resume", "send resume",
  "send your cv", "send cv", "drop your resume", "share your cv",
  "dm me", "dm your", "reach out",
  "full.?time", "part.?time", "contract role", "freelance",
  "remote", "onsite", "hybrid",
  "urgent(ly)? (hiring|looking|required|need)",
  "immediate(ly)? (hiring|joining|required)",
  "ctc", "lpa", "salary", "package",
  "experience required", "years? of experience", "yoe",
  "python developer", "python dev", "automation engineer",
  "sdet", "qa engineer", "software engineer", "software developer",
  "interview", "shortlist", "screening",
];

const HIRING_RE = new RegExp(HIRING_KEYWORDS.join("|"), "i");

function isHiringPost(post) {
  const text = `${post.content || ""} ${post.authorHeadline || ""}`;
  return HIRING_RE.test(text);
}

const INPUT_FILE = "linkedin_posts.json";
const OUTPUT_CSV = "emails.csv";

try {
  const posts = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));

  const emails = [];
  let hiringCount = 0;
  let skippedCount = 0;

  posts.forEach(post => {
    if (!isHiringPost(post)) {
      skippedCount++;
      return;
    }
    hiringCount++;

    const content = post.content || "";
    const matches = content.match(EMAIL_REGEX);
    if (!matches) return;

    const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];
    uniqueEmails.forEach(email => {
      emails.push({ email, post_id: post.id });
    });
  });

  const csvHeader = "email,post_id\n";
  const csvRows = emails.map(e => `${e.email},${e.post_id}`).join("\n");
  fs.writeFileSync(OUTPUT_CSV, csvHeader + csvRows, "utf-8");

  console.log(`📋 Total posts  : ${posts.length}`);
  console.log(`✅ Hiring posts : ${hiringCount}`);
  console.log(`⏭  Skipped      : ${skippedCount}`);
  console.log(`📧 Emails found : ${emails.length}`);
  console.log(`📊 Saved to ${OUTPUT_CSV}`);
} catch (error) {
  console.error("❌ Error:", error.message);
}
