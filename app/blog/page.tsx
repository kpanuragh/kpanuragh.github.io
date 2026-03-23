import type { Metadata } from 'next';
import { getAllPosts, getAllTags } from '@/lib/posts';
import BlogListClient from '@/components/BlogListClient';
import { getBlogSchema, getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles about Laravel, Cybersecurity, Open Source, RF, SDR, and technology experiments.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/blog`,
    title: 'Blog - 0x55aa',
    description: 'Articles about Laravel, Cybersecurity, Open Source, RF, SDR, and technology experiments.',
    images: [
      {
        url: '/og/og-blog.png',
        width: 1200,
        height: 630,
        alt: 'Blog - 0x55aa',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog - 0x55aa',
    description: 'Articles about Laravel, Cybersecurity, Open Source, RF, SDR, and technology experiments.',
    images: ['/og/og-blog.png'],
  },
};

export default function BlogPage() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="terminal-card mb-8">
        <h1 className="text-4xl font-bold text-terminal-accent mb-4">Blog</h1>
        <p className="text-terminal-text">
          Thoughts on Laravel development, cybersecurity, open source, and technology experiments.
        </p>
      </div>

      <BlogListClient posts={posts} allTags={tags} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            getBlogSchema(),
            getBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Blog', url: '/blog' },
            ]),
          ]),
        }}
      />
    </div>
  );
}
