import type { Metadata } from 'next';
import { getAllPostSlugs, getPostBySlug, } from '@/lib/posts';
import { formatDate } from '@/lib/date-utils';
import { markdownToHtml } from '@/lib/markdown';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPostingSchema, getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';

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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/blog"
        className="inline-flex items-center text-sm font-medium text-terminal-accent hover:underline mb-6"
      >
        ← Back to Blog
      </Link>

      <article className="terminal-card">
        <header className="mb-8 border-b border-terminal-border pb-6">
          <h1 className="text-3xl font-bold text-terminal-highlight mb-4 leading-tight">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map(tag => (
                <Link
                  key={tag}
                  href={`/blog/tags/${tag.toLowerCase().replace(/\s+/g, '-')}`}
                  className="bg-[#fff3e0] text-terminal-accent px-3 py-1 rounded-md text-xs font-medium hover:bg-[#ffe0b2] transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </header>

        {/* Content is generated from markdown at build time via markdownToHtml */}
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>

      <div className="mt-8 flex justify-center">
        <Link
          href="/blog"
          className="inline-block px-6 py-3 text-sm font-medium text-terminal-accent border border-terminal-border rounded-lg hover:bg-[#fff3e0] transition-colors"
        >
          ← Back to all posts
        </Link>
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
  );
}
