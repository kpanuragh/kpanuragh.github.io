'use client';

import { useState } from 'react';
import type { PostMetadata } from '@/lib/posts';
import BlogCard from '@/components/BlogCard';

interface BlogListClientProps {
  posts: PostMetadata[];
  allTags: string[];
}

export default function BlogListClient({ posts, allTags }: BlogListClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPosts = posts.filter(post => {
    const searchMatch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchTerm.toLowerCase());

    const tagMatch = selectedTag
      ? post.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
      : true;

    return searchMatch && tagMatch;
  });

  const postsPerPage = 12;
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const safePage = currentPage > totalPages && totalPages > 0 ? 1 : currentPage;
  const startIndex = (safePage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  if (safePage !== currentPage) {
    setCurrentPage(1);
  }

  return (
    <>
      {/* Sticky Search & Filter Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e0e0e0] shadow-sm mb-8 -mx-4 px-4">
        <div className="max-w-6xl mx-auto py-4">
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search posts by title or topic..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2.5 border border-[#d0d0d0] rounded-lg text-[#1a1a1a] placeholder-[#999] bg-white focus:outline-none focus:border-[#e65100] focus:ring-1 focus:ring-[#e65100] text-sm"
            />
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex gap-3 items-center">
              <label htmlFor="tag-filter" className="text-sm text-[#666]">Filter by:</label>
              <select
                id="tag-filter"
                value={selectedTag || ''}
                onChange={(e) => {
                  setSelectedTag(e.target.value || null);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 border border-[#d0d0d0] rounded-lg bg-white text-[#1a1a1a] cursor-pointer text-sm focus:outline-none focus:border-[#e65100]"
              >
                <option value="">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag.toLowerCase()}>
                    {tag}
                  </option>
                ))}
              </select>
              {(searchTerm || selectedTag) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedTag(null);
                    setCurrentPage(1);
                  }}
                  className="text-xs text-[#e65100] hover:text-[#d94e00] cursor-pointer font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="text-sm text-[#888]">
              {filteredPosts.length === 0
                ? 'No posts found'
                : `Showing ${startIndex + 1}–${Math.min(endIndex, filteredPosts.length)} of ${filteredPosts.length} posts`}
            </div>
          </div>
        </div>
      </div>

      {/* Blog Cards Grid */}
      {paginatedPosts.length === 0 ? (
        <div className="text-center py-16 px-4">
          <p className="text-[#1a1a1a] text-lg mb-2">No posts found.</p>
          <p className="text-[#888] text-sm">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {paginatedPosts.map(post => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-12 pt-8 border-t border-[#e0e0e0] flex justify-center items-center gap-6">
          <button
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="text-[#e65100] hover:text-[#d94e00] disabled:text-[#ccc] cursor-pointer disabled:cursor-not-allowed font-medium text-sm"
          >
            ← Previous
          </button>
          <span className="text-[#666] text-sm">
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            className="text-[#e65100] hover:text-[#d94e00] disabled:text-[#ccc] cursor-pointer disabled:cursor-not-allowed font-medium text-sm"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
