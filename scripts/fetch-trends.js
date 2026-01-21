#!/usr/bin/env node

/**
 * Trend Fetcher - Fetches trending topics from multiple sources
 * Sources: GitHub, Hacker News, Dev.to, Reddit, Stack Overflow
 */

const https = require('https');

// Fetch GitHub Trending (using a public API)
async function fetchGitHubTrending() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/search/repositories?q=stars:>1000+pushed:>2026-01-14&sort=stars&order=desc&per_page=5',
      headers: { 'User-Agent': 'Node.js' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const repos = JSON.parse(data).items || [];
          const trending = repos.map(repo => ({
            title: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stargazers_count,
            language: repo.language
          }));
          resolve(trending);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Fetch Hacker News Top Stories
async function fetchHackerNews() {
  return new Promise((resolve, reject) => {
    https.get('https://hacker-news.firebaseio.com/v0/topstories.json', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', async () => {
        try {
          const storyIds = JSON.parse(data).slice(0, 5);
          const stories = [];

          for (const id of storyIds) {
            const story = await fetchHNStory(id);
            if (story) stories.push(story);
          }

          resolve(stories);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function fetchHNStory(id) {
  return new Promise((resolve) => {
    https.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const story = JSON.parse(data);
          resolve({
            title: story.title,
            url: story.url || `https://news.ycombinator.com/item?id=${id}`,
            score: story.score
          });
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Fetch Dev.to Trending
async function fetchDevTo() {
  return new Promise((resolve) => {
    https.get('https://dev.to/api/articles?top=7', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const articles = JSON.parse(data).slice(0, 5);
          const trending = articles.map(article => ({
            title: article.title,
            description: article.description,
            url: article.url,
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

// Main function
async function fetchAllTrends() {
  console.log('🔍 Fetching trending topics...\n');

  const [github, hackerNews, devTo] = await Promise.all([
    fetchGitHubTrending(),
    fetchHackerNews(),
    fetchDevTo()
  ]);

  const trends = {
    github: github,
    hackerNews: hackerNews,
    devTo: devTo,
    timestamp: new Date().toISOString()
  };

  console.log('✅ GitHub Trending:', github.length, 'items');
  console.log('✅ Hacker News:', hackerNews.length, 'items');
  console.log('✅ Dev.to:', devTo.length, 'items');
  console.log('\n📊 Total trending topics:',
    github.length + hackerNews.length + devTo.length);

  return trends;
}

// Export for use in other scripts
if (require.main === module) {
  fetchAllTrends().then(trends => {
    console.log('\n📝 Trends data:');
    console.log(JSON.stringify(trends, null, 2));
  });
}

module.exports = { fetchAllTrends };
