'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PostMetadata } from '@/lib/posts-utils';
import BlogCard from '@/components/BlogCard';

interface BlogListClientProps {
  posts: PostMetadata[];
  allTags: string[];
}

export default function BlogListClient({ posts, allTags }: BlogListClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  return (
    <>
      {allTags.length > 0 && (
        <div className="terminal-card mb-8">
          <h2 className="text-xl terminal-heading mb-4">Topics</h2>
          <div className="flex flex-wrap gap-2">
            {allTags.map(tag => (
              <Link
                key={tag}
                href={`/blog/tags/${tag.toLowerCase().replace(/\s+/g, '-')}`}
                className="bg-terminal-bg text-terminal-success px-3 py-1 rounded text-sm hover:bg-terminal-accent hover:text-white transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="terminal-card text-center py-12">
          <p className="text-terminal-text text-lg mb-4">No blog posts yet.</p>
          <p className="text-gray-400 text-sm">Check back soon for new content!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map(post => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </>
  );
}
