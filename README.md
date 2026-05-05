# LinkedIn Scraper

Scrapes LinkedIn search results for posts matching a keyword query, saves them to JSON and CSV, then extracts email addresses found in post content into a separate CSV.

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- A LinkedIn account

---

## Installation

```bash
npm install
npx playwright install chromium
```

---

## Configuration

Edit `config.json` with your LinkedIn credentials and how many posts to collect:

```json
{
  "email": "your@email.com",
  "password": "yourpassword",
  "targetPosts": 500
}
```

| Field | Description |
|---|---|
| `email` | Your LinkedIn login email |
| `password` | Your LinkedIn password |
| `targetPosts` | Number of posts to collect before stopping |

> **Note:** Keep `config.json` out of version control. It is already listed in `.gitignore`.

---
replace this link in scrapper .js with the desired designation link of the linkedin search
"https://www.linkedin.com/search/results/content/?keywords=%22Data%20Engineer%22%20and%20%223%20years%22&origin=FACETED_SEARCH&sid=-M%2C&sortBy=%22date_posted%22"

---

## Step 1 — Run the Scraper

```bash
node Scraper.js
```

- A browser window will open and log in to LinkedIn automatically.
- If LinkedIn shows a verification/CAPTCHA checkpoint, complete it manually in the browser window — the scraper will wait up to 60 seconds.
- The scraper scrolls the search results page and collects posts until it hits `targetPosts`.
- Progress is printed to the console. Every 50 posts it auto-saves.

**Output files:**

| File | Contents |
|---|---|
| `linkedin_posts.json` | All scraped posts (full data) |
| `linkedin_posts.csv` | Same data in CSV format |

---

## Step 2 — Extract Emails

After the scraper finishes, run:

```bash
node extract_emails.js
```

This reads `linkedin_posts.json`, finds all email addresses in post content using regex, and writes them to a CSV.

**Output file:**

| File | Contents |
|---|---|
| `emails.csv` | Two columns: `email`, `post_id` |

---

## Output Fields

`linkedin_posts.json` / `linkedin_posts.csv` contain these fields per post:

| Field | Description |
|---|---|
| `id` | Unique post identifier |
| `author` | Author's display name |
| `authorHeadline` | Author's LinkedIn headline |
| `timestamp` | Post date/time |
| `content` | Post body text |
| `likes` | Reaction count |
| `comments` | Comment count |
| `reposts` | Repost count |
| `postUrl` | Direct link to the post |

`emails.csv` contains:

| Field | Description |
|---|---|
| `email` | Extracted email address (lowercased) |
| `post_id` | ID of the post it was found in |
