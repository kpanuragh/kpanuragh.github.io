import { getAllPostSlugs, getPostBySlug, formatDate } from '@/lib/posts';
import { markdownToHtml } from '@/lib/markdown';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const post = getPostBySlug(slug);
    return {
      title: `${post.title} - 0x55aa`,
      description: post.excerpt,
      keywords: post.tags,
    };
  } catch {
    return {
      title: 'Post Not Found - 0x55aa',
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
        className="inline-block text-terminal-success hover:underline mb-6"
      >
        ← Back to Blog
      </Link>

      <article className="terminal-card">
        <header className="mb-8 border-b border-terminal-border pb-6">
          <h1 className="text-4xl font-bold text-terminal-accent mb-4">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>•</span>
            <span>{post.readingTime}</span>
          </div>

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map(tag => (
                <span
                  key={tag}
                  className="bg-terminal-bg text-terminal-success px-3 py-1 rounded text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div
          className="prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>

      <div className="mt-8 flex justify-center">
        <Link
          href="/blog"
          className="terminal-card inline-block px-6 py-3 text-terminal-success hover:bg-terminal-bg transition-colors"
        >
          ← Back to all posts
        </Link>
      </div>
    </div>
  );
}
