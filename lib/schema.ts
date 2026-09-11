import { siteConfig, NAME_VARIANTS } from './seo-config';
import { Post } from './posts';
import { certifications, roles, Role } from './cv';
import { projects } from './projects';

const currentRole: Role = (() => {
  const r = roles.find(role => role.end === null && role.org === 'Cubet Techno Labs');
  if (!r) throw new Error('getPersonSchema: no current Cubet Techno Labs role found in lib/cv.ts roles');
  return r;
})();

/** `next.config.ts` sets `trailingSlash: true`; every page route on this site resolves with a trailing slash. */
function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: withTrailingSlash(siteConfig.url),
    description: siteConfig.description,
    author: {
      '@type': 'Person',
      name: siteConfig.author.name,
      url: withTrailingSlash(siteConfig.author.url),
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/blog/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function getPersonSchema() {
  const s = siteConfig.social;
  const sameAs = [
    `https://github.com/${s.github}`,
    `https://www.linkedin.com/in/${s.linkedin}`,
    `https://x.com/${s.twitter.replace('@', '')}`,
    s.npm ? `https://www.npmjs.com/~${s.npm}` : '',
    s.devto ? `https://dev.to/${s.devto}` : '',
    s.instagram ? `https://www.instagram.com/${s.instagram}/` : '',
    s.stackoverflow ? `https://stackoverflow.com/users/${s.stackoverflow}` : '',
  ].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: siteConfig.author.name,
    alternateName: NAME_VARIANTS,
    url: withTrailingSlash(siteConfig.author.url),
    image: `${siteConfig.url}/profile.jpg`,
    email: `mailto:${siteConfig.author.email}`,
    jobTitle: currentRole.title,
    worksFor: { '@type': 'Organization', name: currentRole.org },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kochi',
      addressRegion: 'Kerala',
      addressCountry: 'IN',
    },
    sameAs,
    hasCredential: certifications.map(c => ({
      '@type': 'EducationalOccupationalCredential',
      name: c.name,
      credentialCategory: 'certificate',
      recognizedBy: { '@type': 'Organization', name: c.issuer },
      validFrom: c.issued,
      ...(c.expires ? { validUntil: c.expires } : {}),
      ...(c.credentialId ? { identifier: c.credentialId } : {}),
    })),
    knowsAbout: [
      'Laravel', 'PHP', 'Node.js', 'Backend Architecture',
      'Application Security', 'Kubernetes', 'DevOps', 'CI/CD', 'Rust',
    ],
    description: siteConfig.description,
  };
}

export function getProfilePageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: getPersonSchema(),
  };
}

export function getBlogSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${siteConfig.name} Blog`,
    url: `${siteConfig.url}/blog/`,
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
    dateModified: post.updated || post.date,
    author: {
      '@type': 'Person',
      name: siteConfig.author.name,
      url: withTrailingSlash(siteConfig.author.url),
    },
    publisher: {
      '@type': 'Person',
      name: siteConfig.author.name,
    },
    url: `${siteConfig.url}/blog/${post.slug}/`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.url}/blog/${post.slug}/`,
    },
    keywords: post.tags.join(', '),
    articleSection: post.tags[0] || 'Technology',
    wordCount: post.content.split(/\s+/).length,
    timeRequired: post.readingTime,
  };
}

export function getWorkCollectionSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Work',
    url: `${siteConfig.url}/work/`,
    description: 'Open-source projects by Anuragh KP — compression libraries, MCP servers, and an operating system kernel.',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: projects.map((p, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: p.name,
        description: p.blurb,
        url: `${siteConfig.url}/work/${p.slug}/`,
      })),
    },
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
      item: `${siteConfig.url}${withTrailingSlash(item.url)}`,
    })),
  };
}
