const fs = require("fs");

const EMAIL_REGEX = /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.(com|in|org|net|edu|gov|io|co|uk|ca|au|de|fr|jp|cn|ru|br|mx|it|es|nl|se|ch|be|at|nz|sg|hk|ae|sa|za|kr|tw|th|vn|ph|id|my|pk|bd|lk|ng|ke|eg|tr|il|no|dk|fi|gr|pt|cz|pl|ro|ua|bg|hr|sk|hu|si|lt|lv|ee|is|ie|il|mx|ar|cl|co|ve|pe|uy|bo|py|ec|gy|sr|fk|gl|pm|re|mu|sc|km|dz|tn|ly|sd|et|sd|dj|so|er|jm|bs|bb|tt|ky|ag|vc|lc|dm|gd|kn|ai|vg|tc|ms|bm|gi)/gi;

const INPUT_FILE = "linkedin_posts.json";
const OUTPUT_CSV = "emails_with_details.csv";

// Function to extract company name from content
function extractCompany(content) {
  // Try to extract company from email domain first (e.g., from company@xyz.com)
  let company = "";

  // Look for patterns like "at [Company Name]", "We're Hiring at", "#Hiring at"
  const patterns = [
    /We're\s+#?Hiring\s+at\s+([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\s*!|\n|—|$)/,
    /🚀\s+We're\s+#?Hiring\s+at\s+([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\s*!|\n|—|$)/,
    /#Hiring\s+at\s+([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\s*!|\n|—|$)/i,
    /hiring\s+at\s+([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\s+for|\!|\n|$)/i,
    /Hiring\s+at\s+([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\s*!|\n|—|$)/,
    /at\s+([A-Z][a-zA-Z0-9\s&,.':-]{3,}?)\s+(?:is\s+hiring|are\s+hiring|announces?|opens?|looking)/i,
    /We\s+are\s+hiring\s+(?:for\s+)*(?:a\s+)?([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\sat\s+)?([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\n|—|$)/i,
  ];

  for (let pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim().replace(/\s+/g, " ");
      if (extracted.length > 2 && extracted.length < 100 && !extracted.includes("hiring") && !extracted.toLowerCase().includes("job")) {
        company = extracted;
        break;
      }
    }
  }

  // If still not found, try to extract from "Apply at:" or similar
  if (!company) {
    const applyMatch = content.match(/Apply\s+(?:at|to):\s*([A-Z][a-zA-Z0-9\s&,.':-]+?)(?:\n|—|—|$)/i);
    if (applyMatch && applyMatch[1] && applyMatch[1].length < 100) {
      company = applyMatch[1].trim().replace(/\s+/g, " ");
    }
  }

  return company;
}

// Function to extract job position from content
function extractPosition(content) {
  // Look for job titles
  const positions = [
    "Senior Python Developer",
    "Python Developer",
    "Backend Engineer",
    "Frontend Developer",
    "Full Stack Developer",
    "Data Scientist",
    "AI Engineer",
    "Machine Learning Engineer",
    "DevOps Engineer",
    "Cloud Engineer",
    "Android Developer",
    "iOS Developer",
    "Mobile Developer",
    "QA Engineer",
    "Product Manager",
    "Sales Executive",
    "Data Engineer",
    "Solutions Architect",
    "Technical Lead",
    "Engineering Manager",
    "Senior Software Engineer",
    "Junior Developer",
    "Intern",
    "Contractor",
    "Consultant",
  ];

  // Case-insensitive search for job titles
  for (let pos of positions) {
    if (content.toLowerCase().includes(pos.toLowerCase())) {
      return pos;
    }
  }

  // Generic pattern matching for job titles
  const genericPattern = /(?:role|position|opening|hiring for):\s*([A-Za-z\s]+?)(?:\n|—|$)/i;
  const match = content.match(genericPattern);
  if (match && match[1]) {
    return match[1].trim().substring(0, 100);
  }

  // Look for "Senior/Junior + Tech keyword + Developer/Engineer"
  const flexPattern = /(?:Senior|Junior|Lead|Principal)\s+([A-Za-z\s]+?)(?:Developer|Engineer|Specialist|Architect)/i;
  const flexMatch = content.match(flexPattern);
  if (flexMatch) {
    return flexMatch[0].substring(0, 100);
  }

  return "";
}

try {
  // Read JSON file
  const posts = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));

  const emails = [];

  // Extract emails and details from each post
  posts.forEach((post) => {
    const content = post.content || "";
    const matches = content.match(EMAIL_REGEX);

    if (matches) {
      // Extract company and position from this post's content
      const company = extractCompany(content);
      const position = extractPosition(content);

      // Remove duplicates from this post
      const uniqueEmails = [...new Set(matches.map((e) => e.toLowerCase()))];
      uniqueEmails.forEach((email) => {
        emails.push({
          email: email,
          post_id: post.id,
          company: company || "N/A",
          position: position || "N/A",
        });
      });
    }
  });

  // Create CSV with headers
  const csvHeader = "email,post_id,company,position\n";
  const csvRows = emails
    .map((e) => {
      const escapedCompany = `"${e.company.replace(/"/g, '""')}"`;
      const escapedPosition = `"${e.position.replace(/"/g, '""')}"`;
      return `${e.email},${e.post_id},${escapedCompany},${escapedPosition}`;
    })
    .join("\n");

  const csvContent = csvHeader + csvRows;

  // Write CSV file
  fs.writeFileSync(OUTPUT_CSV, csvContent, "utf-8");

  console.log(`✅ Extracted ${emails.length} email(s) with company and position details`);
  console.log(`📊 Saved to ${OUTPUT_CSV}`);
  
  // Show sample
  console.log("\n📌 Sample entries:");
  emails.slice(0, 5).forEach((e) => {
    console.log(
      `   📧 ${e.email} | 🏢 ${e.company} | 💼 ${e.position} | ID: ${e.post_id}`
    );
  });
} catch (error) {
  console.error("❌ Error:", error.message);
}
