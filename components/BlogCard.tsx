import Link from 'next/link';
import type { PostMetadata } from '@/lib/posts';
import { formatDate } from '@/lib/date-utils';

interface BlogCardProps {
  post: PostMetadata;
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="border border-[#e0e0e0] rounded-lg p-4 bg-white hover:border-[#e65100] hover:shadow-sm transition-all">
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="text-[11px] font-medium bg-[#fff3e0] text-[#e65100] px-2 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="text-xs text-[#999]">{post.readingTime}</span>
        </div>

        <h3 className="text-base font-semibold text-[#1a1a1a] mb-2 group-hover:text-[#e65100] transition-colors leading-snug">
          {post.title}
        </h3>

        <p className="text-sm text-[#666] mb-3 line-clamp-2 leading-relaxed">
          {post.excerpt}
        </p>

        <div className="flex items-center text-xs text-[#999]">
          <span>{formatDate(post.date)}</span>
        </div>
      </article>
    </Link>
  );
}
