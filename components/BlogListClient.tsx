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
      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-5 mb-8" style={{ boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.04)' }}>
        <div className="mb-4">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search posts..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-12 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-terminal-highlight dark:text-gray-100 placeholder-gray-400 bg-gray-50 dark:bg-gray-900/50 focus:outline-none focus:border-[#e65100] focus:ring-2 focus:ring-[#e65100]/10 focus:bg-white dark:focus:bg-gray-900 text-sm transition-all"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex gap-2 items-center">
            <select
              id="tag-filter"
              value={selectedTag || ''}
              onChange={(e) => {
                setSelectedTag(e.target.value || null);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-terminal-highlight dark:text-gray-100 cursor-pointer text-sm focus:outline-none focus:border-[#e65100] transition-colors"
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
                className="text-xs text-[#e65100] hover:text-[#d94e00] cursor-pointer font-semibold px-3 py-1.5 rounded-lg hover:bg-[#fff3e0] transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1.5 rounded-full">
            {filteredPosts.length === 0
              ? 'No posts found'
              : `${filteredPosts.length} posts`}
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
        <div className="mt-12 flex justify-center items-center gap-3">
          <button
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-gray-200 text-terminal-highlight hover:border-[#e65100] hover:text-[#e65100] disabled:text-gray-300 disabled:border-gray-100 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-0.5 disabled:hover:translate-y-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Previous
          </button>
          <span className="text-sm text-gray-500 px-3 py-2 bg-gray-50 rounded-full">
            <strong className="text-terminal-highlight">{safePage}</strong> / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-gray-200 text-terminal-highlight hover:border-[#e65100] hover:text-[#e65100] disabled:text-gray-300 disabled:border-gray-100 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-0.5 disabled:hover:translate-y-0"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
