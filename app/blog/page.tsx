import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts, formatDate } from '@/lib/posts';
import { getBlogSchema, getBreadcrumbSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';

export const metadata: Metadata = {
  title: 'Writing',
  description: 'Occasional writing on backend engineering, application security and DevOps by Anuragh KP.',
  alternates: { canonical: '/blog' },
  openGraph: { type: 'website', url: `${siteConfig.url}/blog`, title: 'Writing — Anuragh KP' },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <h1 className="text-[29px] mb-3">Writing</h1>
      <p className="text-[13px] text-mut leading-relaxed mb-9">
        Infrequent, and only about things I&rsquo;ve actually hit.
      </p>

      {posts.length === 0 ? (
        <p className="text-[12.5px] text-dim">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {posts.map(p => (
            <Link key={p.slug} href={`/blog/${p.slug}`}
                  className="no-underline border-t border-line pt-4 block group">
              <div className="font-mono text-[10px] text-dim">
                {formatDate(p.date)} · {p.readingTime}
              </div>
              <h2 className="my-2 text-[16px] leading-snug group-hover:text-acc transition-colors">
                {p.title}
              </h2>
              <p className="m-0 text-[12px] text-mut leading-relaxed">{p.excerpt}</p>
            </Link>
          ))}
        </div>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            getBlogSchema(),
            getBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Writing', url: '/blog' },
            ]),
          ]),
        }}
      />
    </div>
  );
}
