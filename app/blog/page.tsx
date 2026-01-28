import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts, getAllTags } from '@/lib/posts';
import BlogCard from '@/components/BlogCard';
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

      {tags.length > 0 && (
        <div className="terminal-card mb-8">
          <h2 className="text-xl terminal-heading mb-4">Topics</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <Link
                key={tag}
                href={`/blog/tags/${tag.toLowerCase().replace(/\s+/g, '-')}`}
                className="bg-terminal-bg text-terminal-success px-3 py-1 rounded text-sm hover:bg-terminal-accent hover:text-white transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="terminal-card text-center py-12">
          <p className="text-terminal-text text-lg mb-4">No blog posts yet.</p>
          <p className="text-gray-400 text-sm">Check back soon for new content!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map(post => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}

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
