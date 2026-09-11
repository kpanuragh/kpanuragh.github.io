import type { Metadata } from 'next';
import { getAllPostSlugs, getPostBySlug, getRelatedPosts } from '@/lib/posts';
import { formatDate } from '@/lib/date-utils';
import { markdownToHtml } from '@/lib/markdown';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPostingSchema, getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';
import ReadingProgress from '@/components/ReadingProgress';
import CopyCodeButton from '@/components/CopyCodeButton';
import TableOfContents from '@/components/TableOfContents';
import RelatedPosts from '@/components/RelatedPosts';
import ShareButtons from '@/components/ShareButtons';

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  // Next.js's `output: 'export'` build refuses a dynamic route whose
  // generateStaticParams() resolves to zero routes, even though the
  // function is present (see the "is missing generateStaticParams()"
  // export validation). With no posts yet, emit one placeholder param;
  // the page below calls notFound() for it since no post file matches.
  if (slugs.length === 0) {
    return [{ slug: '__placeholder__' }];
  }
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
  const relatedPosts = getRelatedPosts(slug);
  const postUrl = `${siteConfig.url}/blog/${slug}`;

  return (
    <>
      <ReadingProgress />
      <CopyCodeButton />
      <TableOfContents />

      {/* Article Header */}
      <section className="relative overflow-hidden bg-surf border-b border-line">
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 20% 80%, rgba(200,150,90,0.08), transparent 50%)' }} />
        <div className="max-w-3xl mx-auto px-4 pt-10 pb-14 relative z-10">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-mut hover:text-acc transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Blog
          </Link>

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {post.tags.map(tag => (
                <span
                  key={tag}
                  className="font-mono text-[10.5px] text-dim border border-line rounded px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-3xl md:text-5xl font-bold text-tx leading-tight tracking-tight mb-5">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-mut">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <time dateTime={post.date}>{formatDate(post.date)}</time>
            </div>
            <span className="text-dim">|</span>
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

        <ShareButtons url={postUrl} title={post.title} />

        <RelatedPosts posts={relatedPosts} />

        {/* Footer CTA */}
        <div className="mt-16 pt-8 border-t border-line">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-mut text-sm">Thanks for reading!</p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-bg bg-acc rounded-full transition-all duration-200 hover:-translate-y-0.5"
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
