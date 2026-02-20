#!/usr/bin/env node

/**
 * Batch Blog Generator - Generate multiple blog posts in one run
 * Usage: node batch-generate-blog.js [count] [topic-category]
 * Examples:
 *   node batch-generate-blog.js 3        # Generate 3 posts from random categories
 *   node batch-generate-blog.js 2 security  # Generate 2 security posts
 */

const fs = require('fs');
const path = require('path');
const { generateBlogPost, saveBlogPost } = require('./generate-blog');
const { fetchTopicTrends, TOPIC_CONFIG } = require('./fetch-topic-trends');
const { fetchAllTrends } = require('./fetch-trends');

// Load config
const configPath = path.join(__dirname, '..', 'blog-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Parse command line arguments
const args = process.argv.slice(2);
const postsToGenerate = parseInt(args[0]) || config.generation.postsPerDay || 2;
const categoryFilter = args[1] || null;

// Get available categories
function getCategories() {
  return Object.keys(config.topics);
}

// Get random category
function getRandomCategory() {
  const categories = getCategories();
  return categories[Math.floor(Math.random() * categories.length)];
}

// Get random topic from category
function getTopicFromCategory(category) {
  const topics = config.topics[category];
  if (!topics || topics.length === 0) {
    return null;
  }
  return topics[Math.floor(Math.random() * topics.length)];
}

// Check for duplicate topics to avoid repeats
function checkTopicUsedToday(topic) {
  const postsDir = path.join(__dirname, '..', 'content', 'posts');
  if (!fs.existsSync(postsDir)) {
    return false;
  }

  const today = new Date().toISOString().split('T')[0];
  const files = fs.readdirSync(postsDir)
    .filter(f => f.startsWith(today) && f.endsWith('.md'));

  const normalizeText = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const normalizedTopic = normalizeText(topic);

  for (const file of files) {
    const filepath = path.join(postsDir, file);
    const content = fs.readFileSync(filepath, 'utf-8');
    const titleMatch = content.match(/title:\s*"(.+?)"/);

    if (titleMatch) {
      const existingTitle = normalizeText(titleMatch[1]);
      if (existingTitle.includes(normalizedTopic) || normalizedTopic.includes(existingTitle.split(' ')[0])) {
        return true;
      }
    }
  }

  return false;
}

// Generate single blog post with error handling
async function generateSinglePost(index, topic, category) {
  try {
    console.log(`\n[${'█'.repeat(index + 1)}${'░'.repeat(postsToGenerate - index - 1)}] Post ${index + 1}/${postsToGenerate}`);
    console.log(`📚 Category: ${category} | Topic: ${topic}`);

    // Check for duplicates first
    if (checkTopicUsedToday(topic)) {
      console.log(`⚠️  Topic already covered today, trying alternative...`);
      return null;
    }

    // For topic-specific posts, fetch recent trends for that category
    let trends;
    if (TOPIC_CONFIG[category]) {
      console.log(`🔍 Fetching trends for ${category}...`);
      // Suppress console output from fetchTopicTrends
      const originalLog = console.log;
      console.log = () => {};
      trends = await fetchTopicTrends(category);
      console.log = originalLog;
    } else {
      console.log(`📡 Fetching general tech trends...`);
      trends = await fetchAllTrends();
    }

    // Generate the post
    const content = await generateBlogPost(trends, topic);

    // Extract title
    const titleMatch = content.match(/title:\s*"(.+?)"/);
    const title = titleMatch ? titleMatch[1] : 'auto-generated-post';

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const slug = generateSlug(title);
    const filename = `${date}-${slug}.md`;

    // Save
    const filepath = saveBlogPost(content, filename);

    console.log(`✅ Post saved: ${filename}`);
    return { filename, title, filepath };

  } catch (error) {
    console.error(`❌ Post ${index + 1} failed:`, error.message);
    return null;
  }
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

// Main batch generation
async function batchGenerate() {
  try {
    console.log('\n🚀 Starting batch blog generation...');
    console.log(`📊 Generating ${postsToGenerate} posts`);
    if (categoryFilter) {
      console.log(`🏷️  Category filter: ${categoryFilter}`);
    }
    console.log('─'.repeat(50));

    const results = [];
    const maxAttempts = postsToGenerate * 3; // Allow retries
    let generated = 0;
    let attempts = 0;

    while (generated < postsToGenerate && attempts < maxAttempts) {
      let category, topic;

      if (categoryFilter && config.topics[categoryFilter]) {
        category = categoryFilter;
        topic = getTopicFromCategory(category);
      } else {
        category = getRandomCategory();
        topic = getTopicFromCategory(category);
      }

      if (!topic) {
        attempts++;
        continue;
      }

      const result = await generateSinglePost(generated, topic, category);
      if (result) {
        results.push(result);
        generated++;
      }

      attempts++;

      // Add small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary
    console.log('\n' + '─'.repeat(50));
    console.log(`\n✨ Batch generation complete!`);
    console.log(`📝 Posts generated: ${results.length}/${postsToGenerate}`);

    if (results.length > 0) {
      console.log('\n📚 Generated posts:');
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.title}`);
        console.log(`     📄 ${r.filename}`);
      });
    }

    return {
      success: generated === postsToGenerate,
      generated: results.length,
      results
    };

  } catch (error) {
    console.error('❌ Error in batch generation:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  batchGenerate();
}

module.exports = { batchGenerate };
