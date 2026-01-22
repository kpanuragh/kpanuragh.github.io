#!/usr/bin/env node

/**
 * Blog Generator - Uses Claude API to generate blog posts from trending topics
 * Requires ANTHROPIC_API_KEY environment variable
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { fetchAllTrends } = require('./fetch-trends');

// Load config
const configPath = path.join(__dirname, '..', 'blog-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'api.anthropic.com';

// Call Claude API
async function callClaudeAPI(prompt) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required!');
  }

  const requestData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: ANTHROPIC_API_URL,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve(response.content[0].text);
          } catch (e) {
            reject(new Error('Failed to parse Claude response'));
          }
        } else {
          reject(new Error(`Claude API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(requestData);
    req.end();
  });
}

// Generate blog post based on trends
async function generateBlogPost(trends, topic) {
  console.log(`\n🤖 Generating blog post about: ${topic}...\n`);

  const prompt = `You are a tech blogger writing for a personal blog. Your writing style is conversational, witty, and highly engaging - like chatting with a knowledgeable friend over coffee. Generate a blog post based on these trending topics:

TRENDING DATA:
${JSON.stringify(trends, null, 2)}

TOPIC FOCUS: ${topic}

STYLE REQUIREMENTS (CRITICAL - Match the existing blog voice):
1. Start with a relatable hook or "real talk" moment
2. Use emojis throughout (but not excessively - sprinkle them naturally)
3. Write like you're having a conversation (use "I", "you", contractions)
4. Include witty asides, analogies, and occasional humor
5. Break up content with engaging subheadings (use emojis in headings)
6. Use "Translation:", "Real talk:", "The catch:", "Why it's cool:" type interjections
7. Add personality with phrases like "Let me show you", "Here's the deal", "Mind blown 🤯"
8. Keep paragraphs short and punchy
9. Use bold for emphasis on key points

CONTENT REQUIREMENTS:
1. Length: 800-1200 words
2. Include minimal, practical code examples (2-3 max, only when they add value)
3. Make it actionable - readers should learn something useful
4. Focus on current trends and why they matter NOW
5. Target audience: Developers who want to stay current
6. End with a call-to-action (connect on LinkedIn, check GitHub)

STRUCTURE:
- Engaging title with emoji
- Hook that grabs attention immediately
- Clear sections with emoji-enhanced headings
- Practical examples and insights
- "Bottom Line" or summary section
- Personal CTA at the end

OUTPUT FORMAT:
Return ONLY the markdown content in this exact format:

---
title: "[Catchy, conversational title with emoji 🚀]"
date: "${new Date().toISOString().split('T')[0]}"
excerpt: "[2-3 sentence hook that makes readers want to click - make it conversational and intriguing]"
tags: ["tag1", "tag2", "tag3", "tag4"]
featured: true
---

# [Same title as above]

[Your engaging, conversational blog post here]

---

**[Engaging question or statement]** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - [personal message]

**[Another engaging line]** Check out my [GitHub](https://github.com/kpanuragh) and follow this blog!

*[Final punchy sign-off!]* [emoji]

CRITICAL: Match the tone and style of these example excerpts:
- "Real talk: I love GitHub Copilot. It's amazing. But when I saw that $10/month subscription fee, my inner developer screamed..."
- "Here's the eternal programmer's dilemma: Write beautiful, readable code that's slow as molasses, OR write fast code that looks like line noise from the 90s."
- Use section headers like "## Why Go Open Source for AI Tools? 🌍"
- Use interjections like "**Translation:**", "**Why it's cool:**", "**The catch:**"
- End sections with punchy statements like "**Mind. Blown. 🤯**"

Focus on being informative AND entertaining. Make readers feel like they're learning from a smart, funny friend!`;

  const content = await callClaudeAPI(prompt);
  return content;
}

// Save blog post to file
function saveBlogPost(content, filename) {
  const postsDir = path.join(__dirname, '..', 'content', 'posts');

  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir, { recursive: true });
  }

  const filepath = path.join(postsDir, filename);
  fs.writeFileSync(filepath, content, 'utf-8');

  console.log(`✅ Blog post saved: ${filepath}`);
  return filepath;
}

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
}

// Check for duplicate titles and topics
function checkForDuplicates(title, topic) {
  const postsDir = path.join(__dirname, '..', 'content', 'posts');

  if (!fs.existsSync(postsDir)) {
    return { isDuplicate: false };
  }

  const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

  // Normalize title and topic for comparison
  const normalizeText = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const normalizedTitle = normalizeText(title);
  const normalizedTopic = normalizeText(topic);

  for (const file of files) {
    const filepath = path.join(postsDir, file);
    const content = fs.readFileSync(filepath, 'utf-8');

    // Extract title from frontmatter
    const titleMatch = content.match(/title:\s*"(.+?)"/);
    if (titleMatch) {
      const existingTitle = normalizeText(titleMatch[1]);

      // Check for exact or very similar titles
      if (existingTitle === normalizedTitle ||
          existingTitle.includes(normalizedTopic) ||
          normalizedTitle.includes(normalizedTopic)) {
        return {
          isDuplicate: true,
          existingFile: file,
          existingTitle: titleMatch[1]
        };
      }
    }
  }

  return { isDuplicate: false };
}

// Get trending topics based on current tech trends
function selectTrendingTopic(trends, topicsList) {
  // Priority keywords for trending topics (based on 2026 trends)
  const trendingKeywords = [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm',
    'devops', 'kubernetes', 'docker', 'cicd', 'cloud',
    'node', 'nodejs', 'javascript', 'typescript', 'react',
    'rust', 'performance', 'security', 'linux'
  ];

  // Score topics based on trending data
  const scoredTopics = topicsList.map(topic => {
    let score = 0;
    const topicLower = topic.toLowerCase();

    // Check if topic keywords appear in trending data
    trendingKeywords.forEach(keyword => {
      if (topicLower.includes(keyword)) {
        score += 10;

        // Check if this keyword appears in trending repos/articles
        if (trends.github && trends.github.some(item =>
          (item.description || '').toLowerCase().includes(keyword) ||
          (item.language || '').toLowerCase().includes(keyword)
        )) {
          score += 5;
        }

        if (trends.hackerNews && trends.hackerNews.some(item =>
          (item.title || '').toLowerCase().includes(keyword)
        )) {
          score += 5;
        }

        if (trends.devTo && trends.devTo.some(item =>
          (item.title || '').toLowerCase().includes(keyword) ||
          (item.tags || []).some(tag => tag.toLowerCase().includes(keyword))
        )) {
          score += 5;
        }
      }
    });

    return { topic, score };
  });

  // Sort by score and pick top trending topic
  scoredTopics.sort((a, b) => b.score - a.score);

  // If top topic has a good score, use it; otherwise pick randomly from top 5
  if (scoredTopics[0].score > 0) {
    const topTrending = scoredTopics.slice(0, 5);
    return topTrending[Math.floor(Math.random() * topTrending.length)].topic;
  }

  // Fallback to random topic
  return topicsList[Math.floor(Math.random() * topicsList.length)];
}

// Main function
async function main() {
  try {
    console.log('🚀 Starting automated blog generation...\n');

    // Fetch trends
    const trends = await fetchAllTrends();

    // Get topics from config
    const topics = config.topics;

    // Pick a trending topic or use environment variable
    const topic = process.env.BLOG_TOPIC || selectTrendingTopic(trends, topics);

    console.log(`\n📝 Selected topic: ${topic}`);

    // Check for duplicates before generating
    const duplicateCheck = checkForDuplicates('', topic);
    if (duplicateCheck.isDuplicate) {
      console.log(`⚠️  Similar content already exists: ${duplicateCheck.existingFile}`);
      console.log(`    Existing title: "${duplicateCheck.existingTitle}"`);
      console.log(`    Trying alternative topic...\n`);

      // Try up to 5 different topics
      let attempts = 0;
      let alternativeTopic = topic;
      let altDuplicateCheck = duplicateCheck;

      while (altDuplicateCheck.isDuplicate && attempts < 5) {
        const remainingTopics = topics.filter(t => t !== alternativeTopic);
        alternativeTopic = selectTrendingTopic(trends, remainingTopics);
        altDuplicateCheck = checkForDuplicates('', alternativeTopic);
        attempts++;
      }

      if (altDuplicateCheck.isDuplicate) {
        console.error('❌ Could not find unique topic after 5 attempts. Skipping generation.');
        process.exit(0);
      }

      console.log(`✅ Alternative topic selected: ${alternativeTopic}\n`);
    }

    // Generate blog post
    const content = await generateBlogPost(trends, topic);

    // Extract title from content
    const titleMatch = content.match(/title:\s*"(.+?)"/);
    const title = titleMatch ? titleMatch[1] : 'auto-generated-post';

    // Final duplicate check with actual title
    const finalDuplicateCheck = checkForDuplicates(title, topic);
    if (finalDuplicateCheck.isDuplicate) {
      console.error('❌ Generated blog post title is too similar to existing content:');
      console.error(`    New: "${title}"`);
      console.error(`    Existing: "${finalDuplicateCheck.existingTitle}"`);
      console.error(`    File: ${finalDuplicateCheck.existingFile}`);
      console.error('\n   Skipping to avoid duplicate content.');
      process.exit(0);
    }

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const slug = generateSlug(title);
    const filename = `${date}-${slug}.md`;

    // Save blog post
    const filepath = saveBlogPost(content, filename);

    console.log('\n✨ Blog generation complete!');
    console.log(`📄 File: ${filename}`);
    console.log(`🔗 Title: ${title}`);

    // Return info for GitHub Actions
    return {
      success: true,
      filename,
      title,
      filepath
    };

  } catch (error) {
    console.error('❌ Error generating blog:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateBlogPost, saveBlogPost };
