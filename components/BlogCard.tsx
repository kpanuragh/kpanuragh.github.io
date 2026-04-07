import Link from 'next/link';
import type { PostMetadata } from '@/lib/posts';
import { formatDate } from '@/lib/date-utils';

interface BlogCardProps {
  post: PostMetadata;
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="h-full bg-white rounded-xl border border-gray-200 p-5 transition-all duration-200 hover:shadow-lg hover:border-[#e65100]/30 hover:-translate-y-0.5">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.tags.slice(0, 2).map(tag => (
            <span
              key={tag}
              className="tag-pill !text-[11px] !px-2.5 !py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>

        <h3 className="text-base font-semibold text-terminal-highlight mb-2 group-hover:text-[#e65100] transition-colors leading-snug line-clamp-2">
          {post.title}
        </h3>

        <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto pt-3 border-t border-gray-100">
          <span>{formatDate(post.date)}</span>
          <span>{post.readingTime}</span>
        </div>
      </article>
    </Link>
  );
}
