import type { Metadata } from 'next';
import { getAllPostSlugs, getPostBySlug, } from '@/lib/posts';
import { formatDate } from '@/lib/date-utils';
import { markdownToHtml } from '@/lib/markdown';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPostingSchema, getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';
import ReadingProgress from '@/components/ReadingProgress';
import CopyCodeButton from '@/components/CopyCodeButton';
import TableOfContents from '@/components/TableOfContents';

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  try {
    const post = getPostBySlug(slug);
    const postUrl = `${siteConfig.url}/blog/${slug}`;
    const ogImageUrl = `/og/${slug}.png`;

    return {
      title: post.title,
      description: post.excerpt,
      keywords: post.tags,
      authors: [{ name: siteConfig.author.name }],
      alternates: {
        canonical: `/blog/${slug}`,
      },
      openGraph: {
        type: 'article',
        url: postUrl,
        title: post.title,
        description: post.excerpt,
        publishedTime: post.date,
        authors: [siteConfig.author.name],
        tags: post.tags,
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: post.title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: post.title,
        description: post.excerpt,
        images: [ogImageUrl],
        creator: siteConfig.social.twitter,
      },
    };
  } catch {
    return {
      title: 'Post Not Found',
    };
  }
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let post;
  try {
    post = getPostBySlug(slug);
  } catch {
    notFound();
  }

  const htmlContent = await markdownToHtml(post.content);

  return (
    <>
      <ReadingProgress />
      <CopyCodeButton />
      <TableOfContents />

      {/* Article Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#fff7ed] via-[#f8f9fa] to-[#f0f4ff] dark:from-[#0f172a] dark:via-[#1e293b] dark:to-[#0f172a]">
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 20% 80%, #e6510015, transparent 50%)' }} />
        <div className="max-w-3xl mx-auto px-4 pt-10 pb-14 relative z-10">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-[#e65100] transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Blog
          </Link>

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {post.tags.map(tag => (
                <Link
                  key={tag}
                  href={`/blog/tags/${tag.toLowerCase().replace(/\s+/g, '-')}`}
                  className="tag-pill"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          <h1 className="text-3xl md:text-5xl font-bold text-terminal-highlight dark:text-gray-100 leading-tight tracking-tight mb-5">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <time dateTime={post.date}>{formatDate(post.date)}</time>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{post.readingTime}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Article Body */}
      <div className="max-w-3xl mx-auto px-4 py-12">
        <article>
          {/* Content generated from markdown at build time via markdownToHtml */}
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </article>

        {/* Footer CTA */}
        <div className="mt-16 pt-8 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">Thanks for reading!</p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white rounded-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #e65100, #ff6d00)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to all posts
            </Link>
          </div>
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              getBlogPostingSchema(post),
              getBreadcrumbSchema([
                { name: 'Home', url: '/' },
                { name: 'Blog', url: '/blog' },
                { name: post.title, url: `/blog/${slug}` },
              ]),
            ]),
          }}
        />
      </div>
    </>
  );
}
