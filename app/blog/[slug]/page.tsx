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
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-sm font-medium text-terminal-accent hover:underline mb-4"
      >
        ← Back to Blog
      </Link>

      <article>
        <header className="mb-6">
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
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

          <h1 className="text-3xl md:text-4xl font-bold text-terminal-highlight mb-3 leading-tight tracking-tight">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>
        </header>

        <hr className="border-terminal-border mb-8" />

        {/* Content is generated from markdown at build time via markdownToHtml */}
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>

      <div className="mt-12 pt-6 border-t border-terminal-border flex justify-center">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-terminal-accent rounded-lg hover:opacity-90 transition-opacity"
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
