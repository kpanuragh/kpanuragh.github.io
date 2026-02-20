# Automated Blog Generation System

This project includes an automated blog generation system powered by Claude API that can generate 5-50+ blog posts per week with minimal configuration.

## Overview

The system generates tech blog posts across 9 different topic categories:

- **Backend**: Node.js, Express, API patterns, databases, performance
- **Security**: OWASP, vulnerabilities, authentication, encryption
- **Cloud**: AWS, serverless, Lambda, DynamoDB, etc.
- **DevOps**: Docker, Kubernetes, CI/CD, GitOps
- **Architecture**: Microservices, event-driven, caching, scaling
- **Frontend**: React, TypeScript, CSS, testing, accessibility
- **Database**: Replication, optimization, indexing, monitoring
- **Languages**: Rust, Laravel, PHP, Golang
- **RF/SDR**: Radio, RF, signal processing, hardware

## Setup

### 1. Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable set with your Claude API key
- GitHub repository with Actions enabled

### 2. Configuration

Edit `blog-config.json`:

```json
{
  "generation": {
    "postsPerDay": 2,      // Posts to generate in automated runs
    "autoPublish": true,   // Auto-commit to repo
    "schedule": "daily"    // Or "weekly"
  },
  "style": {
    "authorContext": "Your professional background here"
  }
}
```

### 3. Set GitHub Secrets

Add to your repository settings:

```
ANTHROPIC_API_KEY: your-api-key-here
```

## Usage

### Manual Generation

Generate a single post:
```bash
npm run generate-blog
```

Generate multiple posts at once:
```bash
npm run batch-blog -- 3              # 3 random posts
npm run batch-blog -- 2 security     # 2 security posts
npm run batch-blog -- 5 cloud        # 5 cloud/AWS posts
```

Predefined batch commands:
```bash
npm run batch-blog:quick    # 2 posts
npm run batch-blog:daily    # 3 posts
npm run batch-blog:weekly   # 7 posts
```

### Automated Generation

The system includes two automated workflows:

#### Daily Automatic Generation

**Trigger**: Every day at 9 AM UTC (configurable in `.github/workflows/auto-blog-generation.yml`)

**Posts per run**: 2-3 (configurable in `blog-config.json`)

**Action**: Creates a PR with new posts for review

#### Manual Workflow Dispatch

Trigger from GitHub Actions UI:
1. Go to **Actions** → **Automated Blog Generation**
2. Click **Run workflow**
3. Select:
   - Number of posts (1, 2, 3, 5, or 7)
   - Category (or leave blank for random)
4. Posts are generated and a PR is created

## How It Works

### 1. Trend Fetching
The system fetches current trends from:
- **GitHub**: Top repositories by topic
- **Dev.to**: Popular articles
- **Reddit**: Hot discussions
- **HackerNews**: Trending stories

### 2. Topic Selection
- Random selection from topic pool
- Weighted by trending data relevance
- Avoids duplicates within same day
- Supports category filtering

### 3. Content Generation
Claude generates:
- Engaging, conversational tone
- Code examples (2-3 max)
- Clear, actionable insights
- Proper frontmatter (title, date, tags)
- CTA with social links

### 4. Quality Checks
- Title uniqueness verification
- Duplicate content detection
- Proper markdown formatting
- Frontmatter validation

### 5. Publishing
- Files saved to `content/posts/YYYY-MM-DD-slug.md`
- Automatic PR creation (daily flow)
- Manual approval before merge
- Commit to main branch

## Expected Output

### Scheduled Daily Run
- 2-3 blog posts per day
- ~15-20 posts per week
- ~60-80 posts per month
- Auto-PR for review

### Sample File Structure
```
content/posts/
├── 2026-02-20-nodejs-event-loop-async-hell-to-heaven.md
├── 2026-02-20-aws-iam-mistakes-security-nightmare.md
├── 2026-02-20-rust-ownership-memory-management.md
└── ...
```

### Sample Generated Post
```markdown
---
title: "Node.js Event Loop: From Async Hell to Heaven 🚀"
date: "2026-02-20"
excerpt: "Real talk about how the Node.js event loop works..."
tags: ["nodejs", "async", "javascript", "performance"]
featured: true
---

# Node.js Event Loop: From Async Hell to Heaven 🚀

Real talk: Understanding the event loop changed how I write Node.js code...
```

## Customization

### Add More Topics

Edit `blog-config.json`:

```json
{
  "topics": {
    "myCategory": [
      "Topic idea 1",
      "Topic idea 2",
      "Topic idea 3"
    ]
  }
}
```

### Change Author Voice

Update the prompt in `scripts/generate-blog.js` or the `authorContext` in `blog-config.json`.

### Adjust Generation Schedule

Edit `.github/workflows/auto-blog-generation.yml`:

```yaml
on:
  schedule:
    # Daily at 9 AM UTC
    - cron: '0 9 * * *'
    # Or weekly on Monday at 8 AM
    - cron: '0 8 * * 1'
```

### Change Posts Per Day

```json
{
  "generation": {
    "postsPerDay": 5  // Generate 5 posts daily
  }
}
```

## Performance & Costs

### API Usage
- ~4,000 tokens per post (varies)
- 2 posts/day = ~240k tokens/month
- 3 posts/day = ~360k tokens/month
- Estimated cost: $1-5/month (depending on model)

### Generation Time
- Single post: ~10-15 seconds
- Batch of 2: ~25-35 seconds
- Batch of 3: ~35-50 seconds
- With trend fetching: +5-10 seconds

## Troubleshooting

### Posts not generating
1. Check `ANTHROPIC_API_KEY` is set correctly
2. Check API quota/limits
3. Review GitHub Actions logs
4. Verify `blog-config.json` is valid JSON

### Duplicate content detection
- System checks titles and keywords
- Skip topics already covered that day
- Retries with alternative topic (up to 5 attempts)

### Posts not appearing in PR
1. Check `content/posts/` directory created correctly
2. Verify frontmatter format
3. Check file naming convention (YYYY-MM-DD-slug.md)

### API rate limiting
- Add delays between requests (already included)
- Reduce batch size (`postsPerDay`)
- Stagger schedules if multiple workflows

## Advanced Configuration

### Topic-Specific Trends

The system can fetch trends for specific categories:

```bash
node scripts/fetch-topic-trends.js security
node scripts/fetch-topic-trends.js rust
node scripts/fetch-topic-trends.js devops
```

This provides better context for topic-specific generation.

### Integration with Main Workflow

The batch generation can be integrated with your build pipeline:

```bash
npm run auto-blog:batch  # Generate posts and build site
```

## Scaling to Production

For high-volume generation:

1. **Increase daily quota**: Set `postsPerDay: 5` or higher
2. **Multiple workflows**: Schedule at different times
3. **Content moderation**: Review before auto-merge
4. **SEO optimization**: Add keywords to frontmatter
5. **Distribution**: Auto-tweet, email notifications, RSS

## Tips for Success

1. **Review generated content** before merging
2. **Update author context** for better voice matching
3. **Add custom topics** relevant to your niche
4. **Monitor engagement** to see what resonates
5. **Combine with manual posts** for best results
6. **Use featured flag** for highlighted posts
7. **Add internal links** between related posts

## Example: Scale to 50+ Posts/Month

To generate ~50 posts per month:

1. Set `postsPerDay: 3` in config
2. Create daily scheduled workflow
3. Stagger across different times if needed
4. Review and merge PRs weekly
5. Monitor API usage and adjust as needed

Result: ~90 posts/month with minimal effort!

## See Also

- [Blog Generation Scripts](./scripts/)
- [Configuration](./blog-config.json)
- [GitHub Workflows](./.github/workflows/)
- [Claude API Documentation](https://docs.anthropic.com/)
