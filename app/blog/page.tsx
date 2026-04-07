import type { Metadata } from 'next';
import { getAllPosts, getAllTags } from '@/lib/posts';
import BlogListClient from '@/components/BlogListClient';
import { getBlogSchema, getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles about Cybersecurity, Open Source, RF, SDR, and technology experiments.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/blog`,
    title: 'Blog - 0x55aa',
    description: 'Articles about Cybersecurity, Open Source, RF, SDR, and technology experiments.',
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
    description: 'Articles about Cybersecurity, Open Source, RF, SDR, and technology experiments.',
    images: ['/og/og-blog.png'],
  },
};

export default function BlogPage() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <>
      {/* Blog Header */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #f8f9fa 50%, #f0f4ff 100%)' }}>
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 30% 50%, #e6510015, transparent 50%)' }} />
        <div className="max-w-6xl mx-auto px-4 py-14 relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold text-terminal-highlight tracking-tight mb-3">Blog</h1>
          <p className="text-gray-500 text-lg max-w-xl">
            Thoughts on cybersecurity, open source, SDR, and technology experiments.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-8">
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
    </>
  );
}
