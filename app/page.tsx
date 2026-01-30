import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import BlogCard from '@/components/BlogCard';
import { getWebSiteSchema, getPersonSchema } from '@/lib/schema';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: "website",
    url: 'https://iamanuragh.in',
  },
};

export default function Home() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <section className="terminal-card mb-12">
          <h1 className="text-4xl font-bold text-terminal-accent mb-6 text-center">
            0x55aa
          </h1>

          <section id="about" className="scroll-mt-20">
            <h2 className="text-2xl terminal-heading mb-4">About Me</h2>
            <p className="leading-relaxed">
              I am a passionate Laravel Developer who thrives on coding and debugging, constantly striving
              to turn challenges into opportunities for growth. Beyond development, I have a deep
              interest in cybersecurity and actively contribute as a core member of esteemed
              communities like YAS (Yet Another Security) and InitCrew, where I collaborate with
              like-minded enthusiasts to push the boundaries of digital security.
            </p>
            <p className="leading-relaxed mt-4">
              An advocate for open-source, I love giving back to the community by contributing to
              various open-source projects, believing in the power of collaboration to drive
              innovation. When I'm not immersed in code, you'll often find me exploring the
              fascinating world of Radio Frequency (RF) using SDR devices, blending my curiosity for
              technology with hands-on experimentation.
            </p>
            <p className="leading-relaxed mt-4">
              Technology inspires me in every way—it's a boundless world of possibilities that fuels
              my creativity and drives my curiosity every single day.
            </p>
          </section>
        </section>

        {recentPosts.length > 0 && (
          <section className="mb-12">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl terminal-heading">Latest Posts</h2>
              <Link
                href="/blog"
                className="text-terminal-success hover:underline text-sm"
              >
                View all posts →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentPosts.map(post => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        )}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([getWebSiteSchema(), getPersonSchema()]),
        }}
      />
    </>
  );
}
