#!/usr/bin/env node

/**
 * Topic-Specific Trend Fetcher
 * Fetches trending topics for specific blog categories
 * Usage: node fetch-topic-trends.js <topic>
 * Topics: security, laravel, rust, opensource, aws, nodejs, architecture, devops, rf-sdr
 */

const https = require('https');

// Topic configurations with search keywords and filters
const TOPIC_CONFIG = {
  security: {
    name: 'Cybersecurity',
    github: ['security', 'cybersecurity', 'vulnerability', 'pentest', 'infosec'],
    devto: ['security', 'cybersecurity', 'hacking', 'infosec'],
    subreddit: 'netsec',
    keywords: ['OWASP', 'CVE', 'vulnerability', 'exploit', 'authentication', 'encryption']
  },
  laravel: {
    name: 'Laravel/PHP',
    github: ['laravel', 'php', 'eloquent'],
    devto: ['laravel', 'php'],
    subreddit: 'laravel',
    keywords: ['Laravel 11', 'Eloquent', 'Livewire', 'Filament', 'API', 'testing']
  },
  rust: {
    name: 'Rust',
    github: ['rust', 'rustlang', 'cargo'],
    devto: ['rust', 'rustlang'],
    subreddit: 'rust',
    keywords: ['async', 'ownership', 'borrowing', 'WebAssembly', 'Tokio', 'Actix']
  },
  opensource: {
    name: 'Open Source',
    github: ['opensource', 'hacktoberfest', 'good-first-issue'],
    devto: ['opensource', 'github', 'contributing'],
    subreddit: 'opensource',
    keywords: ['contributing', 'maintainer', 'community', 'license', 'fork']
  },
  aws: {
    name: 'AWS/Cloud',
    github: ['aws', 'serverless', 'lambda', 'terraform'],
    devto: ['aws', 'serverless', 'cloud'],
    subreddit: 'aws',
    keywords: ['Lambda', 'S3', 'EC2', 'CloudFormation', 'serverless', 'cost']
  },
  nodejs: {
    name: 'Node.js',
    github: ['nodejs', 'express', 'nestjs', 'fastify'],
    devto: ['node', 'javascript', 'express'],
    subreddit: 'node',
    keywords: ['Express', 'NestJS', 'async', 'npm', 'API', 'performance']
  },
  architecture: {
    name: 'Architecture',
    github: ['microservices', 'system-design', 'architecture'],
    devto: ['architecture', 'microservices', 'systemdesign'],
    subreddit: 'softwarearchitecture',
    keywords: ['microservices', 'monolith', 'scaling', 'caching', 'event-driven', 'DDD']
  },
  devops: {
    name: 'DevOps',
    github: ['devops', 'docker', 'kubernetes', 'cicd'],
    devto: ['devops', 'docker', 'kubernetes', 'cicd'],
    subreddit: 'devops',
    keywords: ['Docker', 'Kubernetes', 'CI/CD', 'GitOps', 'monitoring', 'Terraform']
  },
  'rf-sdr': {
    name: 'RF/SDR',
    github: ['sdr', 'rtl-sdr', 'gnuradio', 'radio'],
    devto: ['radio', 'hardware', 'iot'],
    subreddit: 'RTLSDR',
    keywords: ['RTL-SDR', 'GNU Radio', 'spectrum', 'antenna', 'signal', 'wireless']
  }
};

// Get date string for last week
function getLastWeekDate() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0];
}

// Fetch GitHub repositories for specific topic
async function fetchGitHubForTopic(topic) {
  const config = TOPIC_CONFIG[topic];
  if (!config) return [];

  const queries = config.github.map(q => `topic:${q}`).join('+');
  const since = getLastWeekDate();

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/search/repositories?q=${queries}+pushed:>${since}&sort=stars&order=desc&per_page=10`,
      headers: { 'User-Agent': 'TrendFetcher/1.0' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const repos = JSON.parse(data).items || [];
          const trending = repos.slice(0, 5).map(repo => ({
            source: 'GitHub',
            title: repo.full_name,
            description: repo.description?.slice(0, 100),
            url: repo.html_url,
            stars: repo.stargazers_count,
            language: repo.language,
            topics: repo.topics?.slice(0, 5)
          }));
          resolve(trending);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Fetch Dev.to articles for specific topic
async function fetchDevToForTopic(topic) {
  const config = TOPIC_CONFIG[topic];
  if (!config) return [];

  const tag = config.devto[0];

  return new Promise((resolve) => {
    https.get(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=10`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const articles = JSON.parse(data);
          const trending = articles.slice(0, 5).map(article => ({
            source: 'Dev.to',
            title: article.title,
            description: article.description?.slice(0, 100),
            url: article.url,
            reactions: article.public_reactions_count,
            tags: article.tag_list
          }));
          resolve(trending);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Fetch Reddit posts for specific topic
async function fetchRedditForTopic(topic) {
  const config = TOPIC_CONFIG[topic];
  if (!config) return [];

  return new Promise((resolve) => {
    const options = {
      hostname: 'www.reddit.com',
      path: `/r/${config.subreddit}/hot.json?limit=10`,
      headers: { 'User-Agent': 'TrendFetcher/1.0' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const posts = JSON.parse(data).data?.children || [];
          const trending = posts
            .filter(p => !p.data.stickied)
            .slice(0, 5)
            .map(p => ({
              source: 'Reddit',
              title: p.data.title,
              url: `https://reddit.com${p.data.permalink}`,
              upvotes: p.data.ups,
              comments: p.data.num_comments
            }));
          resolve(trending);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Extract trending keywords from all sources
function extractTrendingKeywords(trends, topicConfig) {
  const allText = trends.map(t => `${t.title} ${t.description || ''}`).join(' ').toLowerCase();
  const keywords = topicConfig.keywords.filter(kw =>
    allText.includes(kw.toLowerCase())
  );
  return keywords;
}

// Generate blog topic suggestions based on trends
function generateTopicSuggestions(trends, topicConfig) {
  const suggestions = [];

  // Based on GitHub repos
  const githubTrends = trends.filter(t => t.source === 'GitHub');
  if (githubTrends.length > 0) {
    const languages = [...new Set(githubTrends.map(t => t.language).filter(Boolean))];
    const topics = [...new Set(githubTrends.flatMap(t => t.topics || []))];

    if (topics.length > 0) {
      suggestions.push(`Trending ${topicConfig.name} topics: ${topics.slice(0, 3).join(', ')}`);
    }
  }

  // Based on Dev.to articles
  const devtoTrends = trends.filter(t => t.source === 'Dev.to');
  if (devtoTrends.length > 0) {
    const tags = [...new Set(devtoTrends.flatMap(t => t.tags || []))];
    if (tags.length > 0) {
      suggestions.push(`Popular Dev.to tags: ${tags.slice(0, 5).join(', ')}`);
    }
  }

  // Based on Reddit discussions
  const redditTrends = trends.filter(t => t.source === 'Reddit');
  if (redditTrends.length > 0) {
    suggestions.push(`Hot Reddit discussions: ${redditTrends.slice(0, 2).map(t => t.title.slice(0, 50)).join('; ')}`);
  }

  return suggestions;
}

// Main function
async function fetchTopicTrends(topic) {
  const config = TOPIC_CONFIG[topic];

  if (!config) {
    console.error(`❌ Unknown topic: ${topic}`);
    console.log('\nAvailable topics:');
    Object.keys(TOPIC_CONFIG).forEach(t => {
      console.log(`  - ${t}: ${TOPIC_CONFIG[t].name}`);
    });
    process.exit(1);
  }

  console.log(`\n🔍 Fetching trends for: ${config.name}\n`);
  console.log('─'.repeat(50));

  const [github, devto, reddit] = await Promise.all([
    fetchGitHubForTopic(topic),
    fetchDevToForTopic(topic),
    fetchRedditForTopic(topic)
  ]);

  const allTrends = [...github, ...devto, ...reddit];

  // Display results
  console.log(`\n📦 GitHub Trending (${github.length} repos):`);
  github.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.title} ⭐${item.stars}`);
    if (item.description) console.log(`      ${item.description}`);
  });

  console.log(`\n📝 Dev.to Articles (${devto.length} articles):`);
  devto.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.title} ❤️${item.reactions}`);
  });

  console.log(`\n💬 Reddit Discussions (${reddit.length} posts):`);
  reddit.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.title.slice(0, 60)}... ⬆️${item.upvotes}`);
  });

  // Generate suggestions
  const trendingKeywords = extractTrendingKeywords(allTrends, config);
  const suggestions = generateTopicSuggestions(allTrends, config);

  console.log('\n─'.repeat(50));
  console.log('\n💡 BLOG TOPIC SUGGESTIONS:');
  console.log('─'.repeat(50));

  if (trendingKeywords.length > 0) {
    console.log(`\n🔥 Trending Keywords: ${trendingKeywords.join(', ')}`);
  }

  suggestions.forEach(s => console.log(`\n📌 ${s}`));

  console.log('\n🎯 Recommended blog topics for today:');
  config.keywords.forEach((kw, i) => {
    if (i < 5) console.log(`   ${i + 1}. ${kw}`);
  });

  // Return structured data for AI to use
  return {
    topic: config.name,
    trends: allTrends,
    trendingKeywords,
    suggestions,
    recommendedTopics: config.keywords,
    timestamp: new Date().toISOString()
  };
}

// CLI execution
if (require.main === module) {
  const topic = process.argv[2];

  if (!topic) {
    console.log('Usage: node fetch-topic-trends.js <topic>\n');
    console.log('Available topics:');
    Object.keys(TOPIC_CONFIG).forEach(t => {
      console.log(`  - ${t}: ${TOPIC_CONFIG[t].name}`);
    });
    process.exit(0);
  }

  fetchTopicTrends(topic).then(data => {
    console.log('\n─'.repeat(50));
    console.log('\n✅ Trend analysis complete!');
    console.log(`📊 Total items analyzed: ${data.trends.length}`);
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { fetchTopicTrends, TOPIC_CONFIG };
