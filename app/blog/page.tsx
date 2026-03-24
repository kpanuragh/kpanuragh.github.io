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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="terminal-card mb-8">
        <h1 className="text-4xl font-bold text-terminal-accent mb-4">Blog</h1>
        <p className="text-terminal-text">
          Thoughts on Laravel development, cybersecurity, open source, and technology experiments.
        </p>
      </div>

      <BlogListClient posts={posts} allTags={tags} />
    </div>
  );
}
