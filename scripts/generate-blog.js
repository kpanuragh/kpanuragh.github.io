#!/usr/bin/env node

/**
 * Blog Generator - Uses Claude API to generate blog posts from trending topics
 * Requires ANTHROPIC_API_KEY environment variable
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { fetchAllTrends } = require('./fetch-trends');

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

  const prompt = `You are a tech blogger writing for a personal blog. Generate an engaging, user-friendly blog post based on these trending topics:

TRENDING DATA:
${JSON.stringify(trends, null, 2)}

TOPIC FOCUS: ${topic}

REQUIREMENTS:
1. Write in a conversational, fun tone (like chatting with a friend)
2. Use emojis to make it engaging
3. Keep it practical and actionable
4. Include minimal code examples (only when necessary)
5. Make it relatable with analogies and humor
6. Target audience: Developers who want to stay current
7. Length: 800-1200 words

OUTPUT FORMAT:
Return ONLY the markdown content in this exact format:

---
title: "[Catchy Title]"
date: "${new Date().toISOString().split('T')[0]}"
excerpt: "[2-3 sentence summary that hooks readers]"
tags: ["tag1", "tag2", "tag3", "tag4"]
featured: false
---

[Your engaging blog post content here]

Focus on making it fun to read while being informative. Add personality!`;

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

// Main function
async function main() {
  try {
    console.log('🚀 Starting automated blog generation...\n');

    // Fetch trends
    const trends = await fetchAllTrends();

    // Determine topic based on trends
    const topics = [
      'Latest Web Development Trends',
      'This Week in Tech',
      'Laravel and PHP Updates',
      'Cybersecurity News',
      'Open Source Projects to Watch'
    ];

    // Pick a random topic or use environment variable
    const topic = process.env.BLOG_TOPIC || topics[Math.floor(Math.random() * topics.length)];

    console.log(`\n📝 Selected topic: ${topic}`);

    // Generate blog post
    const content = await generateBlogPost(trends, topic);

    // Extract title from content
    const titleMatch = content.match(/title:\s*"(.+?)"/);
    const title = titleMatch ? titleMatch[1] : 'auto-generated-post';

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
