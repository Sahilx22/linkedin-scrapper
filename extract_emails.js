const fs = require("fs");

const EMAIL_REGEX = /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.(com|in|org|net|edu|gov|io|co|uk|ca|au|de|fr|jp|cn|ru|br|mx|it|es|nl|se|ch|be|at|nz|sg|hk|ae|sa|za|kr|tw|th|vn|ph|id|my|pk|bd|lk|ng|ke|eg|tr|il|no|dk|fi|gr|pt|cz|pl|ro|ua|bg|hr|sk|hu|si|lt|lv|ee|is|ie|il|mx|ar|cl|co|ve|pe|uy|bo|py|ec|gy|sr|fk|gl|pm|re|mu|sc|km|dz|tn|ly|sd|et|sd|dj|so|er|jm|bs|bb|tt|ky|ag|vc|lc|dm|gd|kn|ai|vg|tc|ms|bm|gi)/gi;

const INPUT_FILE = "linkedin_posts.json";
const OUTPUT_CSV = "emails.csv";

try {
  // Read JSON file
  const posts = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  
  const emails = [];

  // Extract emails from each post
  posts.forEach(post => {
    const content = post.content || "";
    const matches = content.match(EMAIL_REGEX);
    
    if (matches) {
      // Remove duplicates from this post
      const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];
      uniqueEmails.forEach(email => {
        emails.push({
          email: email,
          post_id: post.id
        });
      });
    }
  });

  // Create CSV
  const csvHeader = "email,post_id\n";
  const csvRows = emails.map(e => `${e.email},${e.post_id}`).join("\n");
  const csvContent = csvHeader + csvRows;

  // Write CSV file
  fs.writeFileSync(OUTPUT_CSV, csvContent, "utf-8");
  
  console.log(`✅ Extracted ${emails.length} email(s)`);
  console.log(`📊 Saved to ${OUTPUT_CSV}`);
} catch (error) {
  console.error("❌ Error:", error.message);
}
