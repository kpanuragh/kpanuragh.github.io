import { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { projects } from '@/lib/projects';

export const dynamic = 'force-static';

const base = 'https://iamanuragh.in';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/work/`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/about/`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/blog/`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/contact/`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
  ];

  const projectPages: MetadataRoute.Sitemap = projects.map(p => ({
    url: `${base}/work/${p.slug}/`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const postPages: MetadataRoute.Sitemap = getAllPosts().map(p => ({
    url: `${base}/blog/${p.slug}/`,
    lastModified: new Date(p.updated || p.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [...staticPages, ...projectPages, ...postPages];
}
