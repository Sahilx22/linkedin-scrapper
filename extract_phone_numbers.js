const fs = require("fs");

// Regex to match various phone number formats
const PHONE_REGEX = /(?:(?:\+|00)\s*[1-9]\s*\d{1,14}|[\(\s]?\d{3}[\)\s]?[-.\s]?\d{3}[-.\s]?\d{4}|\+?[1-9]\s*\d{1,14}|(?:\+91|0)?[6-9]\d{9})/g;

// More comprehensive phone number regex that handles international formats
const INTL_PHONE_REGEX = /(?:(?:\+|00)[\s.-]?[1-9]{1,3}[\s.-]?)?(?:[()[\]]*[\s.-]?)?(?:[0-9]{1,4}[\s.-]?)*[0-9]{4,}/g;

const INPUT_FILE = "linkedin_posts.json";
const OUTPUT_CSV = "phone_numbers.csv";

try {
  // Read JSON file
  const posts = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));

  const phoneNumbers = [];

  // Extract phone numbers from each post
  posts.forEach((post) => {
    const content = post.content || "";
    
    // Match potential phone numbers
    const potentialMatches = content.match(INTL_PHONE_REGEX) || [];
    
    // Filter to get more realistic phone numbers (usually 8-15 digits)
    const validPhones = potentialMatches.filter(phone => {
      // Extract just digits
      const digitsOnly = phone.replace(/\D/g, "");
      // Accept if it has 8-15 digits
      return digitsOnly.length >= 8 && digitsOnly.length <= 15;
    }).filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
    
    validPhones.forEach((phone) => {
      phoneNumbers.push({
        phone_number: phone.trim(),
        post_id: post.id,
        author: post.author || "Unknown"
      });
    });
  });

  // Create CSV with headers
  const csvHeader = "phone_number,post_id,author\n";
  const csvRows = phoneNumbers
    .map((p) => {
      const escapedAuthor = `"${(p.author || "").replace(/"/g, '""')}"`;
      return `"${p.phone_number}",${p.post_id},${escapedAuthor}`;
    })
    .join("\n");

  const csvContent = csvHeader + csvRows;

  // Write CSV file
  fs.writeFileSync(OUTPUT_CSV, csvContent, "utf-8");

  console.log(`✅ Extracted ${phoneNumbers.length} phone number(s)`);
  console.log(`📊 Saved to ${OUTPUT_CSV}`);
  
  // Show samples
  if (phoneNumbers.length > 0) {
    console.log("\n📌 Sample phone numbers:");
    phoneNumbers.slice(0, 5).forEach((p) => {
      console.log(`   📱 ${p.phone_number} | Post: ${p.post_id} | Author: ${p.author}`);
    });
  } else {
    console.log("ℹ️  No phone numbers found in posts.");
  }
} catch (error) {
  console.error("❌ Error:", error.message);
}
