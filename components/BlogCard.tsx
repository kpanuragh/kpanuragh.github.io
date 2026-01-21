import Link from 'next/link';
import { PostMetadata, formatDate } from '@/lib/posts';

interface BlogCardProps {
  post: PostMetadata;
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="terminal-card hover:border-terminal-accent border-2 border-transparent transition-all">
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-wrap gap-2">
            {post.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="text-xs bg-terminal-bg text-terminal-success px-2 py-1 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="text-sm text-gray-400">{post.readingTime}</span>
        </div>

        <h3 className="text-xl font-bold text-terminal-highlight mb-2 group-hover:text-terminal-success transition-colors">
          {post.title}
        </h3>

        <p className="text-terminal-text mb-4 line-clamp-2">
          {post.excerpt}
        </p>

        <div className="flex items-center text-sm text-gray-400">
          <span>{formatDate(post.date)}</span>
        </div>
      </article>
    </Link>
  );
}
