import { siteConfig } from './seo-config';
import { Post } from './posts';

export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    author: {
      '@type': 'Person',
      name: siteConfig.author.name,
      url: siteConfig.author.url,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/blog?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function getPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: siteConfig.author.name,
    url: siteConfig.author.url,
    image: `${siteConfig.url}/profile.jpg`,
    sameAs: [
      `https://github.com/${siteConfig.social.github}`,
      `https://www.linkedin.com/in/${siteConfig.social.linkedin}`,
      `https://x.com/${siteConfig.social.twitter.replace('@', '')}`,
    ].filter(Boolean),
    jobTitle: 'Technical Lead',
    worksFor: {
      '@type': 'Organization',
      name: 'Cubet Techno Labs',
    },
    knowsAbout: [
      'Laravel', 'PHP', 'Node.js', 'Backend Architecture',
      'Application Security', 'Kubernetes', 'DevOps', 'CI/CD',
    ],
    description: siteConfig.description,
  };
}

export function getBlogSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${siteConfig.name} Blog`,
    url: `${siteConfig.url}/blog`,
    description: 'Articles about backend engineering, application security, and DevOps — Laravel, Node.js, and Kubernetes.',
    author: {
      '@type': 'Person',
      name: siteConfig.author.name,
    },
  };
}

export function getBlogPostingSchema(post: Post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage
      ? `${siteConfig.url}${post.coverImage}`
      : `${siteConfig.url}/og/${post.slug}.png`,
    datePublished: post.date,
    dateModified: post.date, // Use modifiedDate from frontmatter if available
    author: {
      '@type': 'Person',
      name: siteConfig.author.name,
      url: siteConfig.author.url,
    },
    publisher: {
      '@type': 'Person',
      name: siteConfig.author.name,
    },
    url: `${siteConfig.url}/blog/${post.slug}`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.url}/blog/${post.slug}`,
    },
    keywords: post.tags.join(', '),
    articleSection: post.tags[0] || 'Technology',
    wordCount: post.content.split(/\s+/).length,
    timeRequired: post.readingTime,
  };
}

export function getBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteConfig.url}${item.url}`,
    })),
  };
}
