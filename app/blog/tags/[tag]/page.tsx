import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllTags, getPostsByTag } from '@/lib/posts';
import BlogCard from '@/components/BlogCard';
import { notFound } from 'next/navigation';
import { getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';

export async function generateStaticParams() {
  const tags = getAllTags();
  return tags.map((tag) => ({
    tag: tag.toLowerCase().replace(/\s+/g, '-'),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag).replace(/-/g, ' ');
  const posts = getPostsByTag(decodedTag);

  if (posts.length === 0) {
    return {
      title: 'Tag Not Found',
    };
  }

  const tagTitle = decodedTag.charAt(0).toUpperCase() + decodedTag.slice(1);
  const pageUrl = `/blog/tags/${tag}`;

  return {
    title: `${tagTitle} Articles`,
    description: `Browse ${posts.length} ${posts.length === 1 ? 'article' : 'articles'} about ${tagTitle}. ${siteConfig.description}`,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: 'website',
      url: `${siteConfig.url}${pageUrl}`,
      title: `${tagTitle} Articles - 0x55aa`,
      description: `Browse ${posts.length} ${posts.length === 1 ? 'article' : 'articles'} about ${tagTitle}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${tagTitle} Articles - 0x55aa`,
      description: `Browse ${posts.length} ${posts.length === 1 ? 'article' : 'articles'} about ${tagTitle}`,
    },
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag).replace(/-/g, ' ');
  const posts = getPostsByTag(decodedTag);

  if (posts.length === 0) {
    notFound();
  }

  const tagTitle = decodedTag.charAt(0).toUpperCase() + decodedTag.slice(1);

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link
          href="/blog"
          className="inline-block text-terminal-success hover:underline mb-6"
        >
          ← Back to Blog
        </Link>

        <div className="terminal-card mb-8">
          <h1 className="text-4xl font-bold text-terminal-accent mb-4">
            #{tagTitle}
          </h1>
          <p className="text-terminal-text">
            {posts.length} {posts.length === 1 ? 'article' : 'articles'} tagged
            with &quot;{decodedTag}&quot;
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            getBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Blog', url: '/blog' },
              { name: tagTitle, url: `/blog/tags/${tag}` },
            ])
          ),
        }}
      />
    </>
  );
}
