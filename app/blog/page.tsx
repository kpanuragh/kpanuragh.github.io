import { getAllPosts, getAllTags } from '@/lib/posts';
import BlogListClient from '@/components/BlogListClient';

export const metadata = {
  title: 'Blog - 0x55aa',
  description: 'Articles about Laravel, Cybersecurity, Open Source, and more',
};

export default function BlogPage() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">Blog</h1>
          <p className="text-[#666] text-sm">
            Thoughts on cybersecurity, open source, SDR, and technology experiments.
          </p>
        </div>

        <BlogListClient posts={posts} allTags={tags} />
      </div>
    </div>
  );
}
