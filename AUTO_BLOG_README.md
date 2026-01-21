# 🤖 Automated Blog Generation

Your blog now has **AI-powered automated blog post generation** using Claude API and GitHub Actions!

## How It Works

```
┌─────────────────┐
│  GitHub Actions │  Runs weekly (or on-demand)
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Fetch Trends   │  Gets trending topics from:
│                 │  • GitHub Trending
│                 │  • Hacker News
│                 │  • Dev.to
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Claude API     │  Generates engaging blog post
│                 │  based on trends
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Save Markdown  │  Creates post in content/posts/
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Auto Commit    │  Commits and pushes to GitHub
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Auto Deploy    │  Builds and deploys to GitHub Pages
└─────────────────┘
```

## Setup (One-Time)

### 1. Get Your Claude API Key

1. Go to https://console.anthropic.com/
2. Create an account (if you don't have one)
3. Go to "API Keys"
4. Click "Create Key"
5. Copy your API key

### 2. Add API Key to GitHub Secrets

1. Go to your repository on GitHub
2. Click: **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Name: `ANTHROPIC_API_KEY`
5. Value: Paste your Claude API key
6. Click **"Add secret"**

### 3. Enable GitHub Actions

The workflow is already configured! It will run:
- **Automatically**: Every Monday at 9 AM UTC
- **Manually**: You can trigger it anytime

## Usage

### Option 1: Automatic (Set It and Forget It!)

The blog will auto-generate a new post every Monday. That's it! 🎉

### Option 2: Manual Trigger (On-Demand)

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Select **"Auto-Generate Blog Post"** workflow
4. Click **"Run workflow"**
5. Optionally enter a specific topic
6. Click green **"Run workflow"** button

### Option 3: Run Locally

```bash
# Set your API key
export ANTHROPIC_API_KEY="your-key-here"

# Fetch current trends (preview)
npm run fetch-trends

# Generate a blog post
npm run generate-blog

# Or specify a topic
BLOG_TOPIC="Laravel Performance Tips" npm run generate-blog
```

## Configuration

Edit `blog-config.json` to customize:

```json
{
  "topics": [
    "Latest Web Development Trends",
    "Laravel and PHP Updates",
    "Cybersecurity News",
    // Add your own topics!
  ],
  "generation": {
    "schedule": "weekly",      // Change frequency
    "autoPublish": true,        // Auto-publish or create draft
    "requireReview": false      // Set true to review before publish
  },
  "style": {
    "tone": "conversational",   // Writing style
    "useEmojis": true,         // Include emojis
    "targetLength": 1000       // Word count target
  }
}
```

## Customizing Topics

### Pre-defined Topics

The system randomly picks from these topics:
- Latest Web Development Trends
- This Week in Tech
- Laravel and PHP Updates
- Cybersecurity News and Tips
- Open Source Projects to Watch
- JavaScript Framework Wars
- Backend Development Best Practices
- DevOps and Cloud Computing
- API Design Patterns
- Database Performance Tips

### Custom Topic (Manual Run)

When running the workflow manually, you can specify any topic:
- "Security vulnerabilities in 2026"
- "Best new Laravel packages this month"
- "AI tools for developers"
- Literally anything!

## Trend Sources

The system fetches trending content from:

### 1. GitHub Trending
- Top starred repositories
- Recent activity (last 7 days)
- Filtered by language (PHP, JavaScript, etc.)

### 2. Hacker News
- Top stories from front page
- High-scoring technical posts
- Community discussions

### 3. Dev.to
- Trending articles
- Popular tags
- Community favorites

## How Claude Generates Posts

The AI:
1. ✅ Analyzes all trending topics
2. ✅ Finds common themes
3. ✅ Creates engaging, conversational content
4. ✅ Adds emojis and personality
5. ✅ Includes minimal, practical code examples
6. ✅ Writes in your blog's style
7. ✅ Generates proper frontmatter

**Result:** A publish-ready blog post that sounds like YOU wrote it!

## Scheduling Options

Edit `.github/workflows/auto-blog.yml`:

```yaml
# Current: Every Monday at 9 AM
- cron: '0 9 * * 1'

# Daily at midnight
- cron: '0 0 * * *'

# Twice a week (Monday & Thursday)
- cron: '0 9 * * 1,4'

# First day of every month
- cron: '0 9 1 * *'
```

[Cron syntax help](https://crontab.guru/)

## Review Before Publishing

Want to review posts before they go live?

1. Edit `.github/workflows/auto-blog.yml`
2. Change auto-commit to create a Pull Request instead:

```yaml
- name: Create Pull Request
  uses: peter-evans/create-pull-request@v5
  with:
    commit-message: "feat: Auto-generate blog post"
    title: "New blog post: [Generated Title]"
    body: "Review this auto-generated blog post before merging"
    branch: "auto-blog/post-${{ github.run_number }}"
```

3. Review the PR
4. Merge when ready
5. Auto-deploys on merge!

## Cost & Limits

### Claude API Pricing (as of 2026)
- Claude Sonnet: ~$3 per million input tokens
- Average blog post: ~0.01-0.02 cents
- **Weekly posts:** ~$1-2 per year

Very affordable! 💰

### Rate Limits
- GitHub Actions: 2,000 minutes/month (free tier)
- Each run: ~2-3 minutes
- Plenty of room for weekly posts!

## Troubleshooting

### "ANTHROPIC_API_KEY not found"
- Make sure you added the secret to GitHub
- Check the secret name is exactly `ANTHROPIC_API_KEY`

### "API rate limit exceeded"
- You hit Claude's rate limit
- Wait a bit and try again
- Consider using a different model tier

### "No trends found"
- Network issue with trend APIs
- Try running again later
- Check if APIs are down

### Workflow not running automatically
- Check the cron schedule in the workflow file
- GitHub Actions can be delayed by up to 10 minutes
- Make sure Actions are enabled in repository settings

## Manual Testing

Test locally before deploying:

```bash
# 1. Install dependencies
npm install

# 2. Set API key
export ANTHROPIC_API_KEY="your-key-here"

# 3. Test trend fetching
npm run fetch-trends

# 4. Test blog generation
npm run generate-blog

# 5. Check the generated post
ls -la content/posts/

# 6. Preview in dev server
npm run dev
```

## Advanced: Multiple Posts per Week

Want more frequent posts? Edit the workflow:

```yaml
schedule:
  # Monday morning
  - cron: '0 9 * * 1'
  # Wednesday evening
  - cron: '0 17 * * 3'
  # Friday afternoon
  - cron: '0 14 * * 5'
```

## What Gets Generated

Each post includes:
- ✅ Catchy, SEO-friendly title
- ✅ Engaging excerpt
- ✅ Relevant tags
- ✅ Conversational tone with emojis
- ✅ Practical code examples (minimal)
- ✅ Real trend references
- ✅ Call-to-action at the end
- ✅ Proper markdown formatting

## Benefits

🎯 **Stay Current** - Always covering trending topics
⏰ **Save Time** - No more "what should I write about?"
📈 **Consistent** - Regular content automatically
🤖 **High Quality** - Claude writes engaging content
💰 **Affordable** - Costs pennies per post
🔄 **Automated** - Set it and forget it!

## Disabling Auto-Generation

Don't want auto-posts anymore?

**Option 1:** Disable the workflow
1. Go to Actions tab
2. Select "Auto-Generate Blog Post"
3. Click ••• menu → "Disable workflow"

**Option 2:** Delete the workflow file
```bash
git rm .github/workflows/auto-blog.yml
git commit -m "Disable auto-blogging"
git push
```

## Questions?

- Issues with setup? Check GitHub Actions logs
- Want different topics? Edit `blog-config.json`
- Need help? Open an issue on GitHub

---

**Happy automated blogging!** 🎉🤖

*Your blog will now stay fresh with minimal effort!*
