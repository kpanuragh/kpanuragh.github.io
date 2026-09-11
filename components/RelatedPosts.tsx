import type { PostMetadata } from '@/lib/posts';
import BlogCard from './BlogCard';

export default function RelatedPosts({ posts }: { posts: PostMetadata[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-16 pt-10 border-t border-line">
      <h2 className="text-xl font-bold text-tx mb-6 flex items-center gap-3">
        <span className="w-8 h-1 bg-acc rounded-full inline-block"></span>
        Related reading
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {posts.map(post => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
