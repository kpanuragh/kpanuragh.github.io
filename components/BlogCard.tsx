import Link from 'next/link';
import type { PostMetadata } from '@/lib/posts';
import { formatDate } from '@/lib/date-utils';

interface BlogCardProps {
  post: PostMetadata;
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="relative h-full bg-white rounded-2xl border border-gray-100 p-6 transition-all duration-300 hover:shadow-xl hover:shadow-orange-100/50 hover:-translate-y-1 hover:border-[#e65100]/20 overflow-hidden">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#e65100] to-[#ff8a50] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

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
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span>{formatDate(post.date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{post.readingTime}</span>
          </div>
        </div>

        {/* Read more indicator */}
        <div className="flex items-center gap-1 mt-3 text-xs font-medium text-[#e65100] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          Read more
          <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>
      </article>
    </Link>
  );
}
