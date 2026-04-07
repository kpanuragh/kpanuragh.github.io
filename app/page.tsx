import type { Metadata } from 'next';
import Image from 'next/image';
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
  const recentPosts = getAllPosts().slice(0, 6);

  return (
    <>
      <div className="max-w-5xl mx-auto px-4">
        {/* Hero Section */}
        <section className="py-16 md:py-20">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <div className="shrink-0">
              <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-full overflow-hidden ring-4 ring-[#e65100]/20 ring-offset-4 ring-offset-[#f8f9fa]">
                <Image
                  src="/profile.jpg"
                  alt="Anurag KP"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-4xl md:text-5xl font-bold text-terminal-highlight tracking-tight mb-3">
                Anurag KP
              </h1>
              <p className="text-lg text-gray-500 mb-5">
                Laravel Developer &middot; Security Enthusiast &middot; Radio Explorer
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <Link
                  href="/blog"
                  className="px-5 py-2.5 bg-[#e65100] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  Read the Blog
                </Link>
                <a
                  href="https://github.com/kpanuragh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 border border-gray-300 text-terminal-highlight text-sm font-medium rounded-lg hover:border-[#e65100] hover:text-[#e65100] transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://www.linkedin.com/in/anuraghkp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 border border-gray-300 text-terminal-highlight text-sm font-medium rounded-lg hover:border-[#e65100] hover:text-[#e65100] transition-colors"
                >
                  LinkedIn
                </a>
                <a
                  href="https://www.npmjs.com/~kpanuragh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 border border-gray-300 text-terminal-highlight text-sm font-medium rounded-lg hover:border-[#e65100] hover:text-[#e65100] transition-colors"
                >
                  npm
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="scroll-mt-20 mb-16">
          <h2 className="text-2xl font-bold text-terminal-highlight mb-6 flex items-center gap-3">
            <span className="w-8 h-1 bg-[#e65100] rounded-full inline-block"></span>
            About
          </h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-6" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' }}>
              <div className="w-10 h-10 rounded-lg bg-[#fff3e0] flex items-center justify-center mb-4 text-[#e65100] font-bold">
                &lt;/&gt;
              </div>
              <h3 className="font-semibold text-terminal-highlight mb-2">Development</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Passionate Laravel Developer who thrives on coding and debugging, constantly turning
                challenges into opportunities for growth. An advocate for open-source, contributing to
                various projects and believing in the power of collaboration.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' }}>
              <div className="w-10 h-10 rounded-lg bg-[#fff3e0] flex items-center justify-center mb-4 text-lg">
                &#x1f6e1;&#xfe0f;
              </div>
              <h3 className="font-semibold text-terminal-highlight mb-2">Security</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Deep interest in cybersecurity, actively contributing as a core member of communities
                like YAS (Yet Another Security) and InitCrew, collaborating to push the boundaries
                of digital security.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' }}>
              <div className="w-10 h-10 rounded-lg bg-[#fff3e0] flex items-center justify-center mb-4 text-lg">
                &#x1f4e1;
              </div>
              <h3 className="font-semibold text-terminal-highlight mb-2">Radio &amp; SDR</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Exploring the fascinating world of Radio Frequency using SDR devices, blending curiosity
                for technology with hands-on experimentation in signal analysis and spectrum exploration.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' }}>
              <div className="w-10 h-10 rounded-lg bg-[#fff3e0] flex items-center justify-center mb-4 text-lg">
                &#x2764;&#xfe0f;
              </div>
              <h3 className="font-semibold text-terminal-highlight mb-2">Open Source</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Love giving back to the community by contributing to open-source projects. Technology
                inspires me in every way — a boundless world of possibilities that fuels creativity
                every single day.
              </p>
            </div>
          </div>
        </section>

        {/* Latest Posts Section */}
        {recentPosts.length > 0 && (
          <section className="mb-16">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-terminal-highlight flex items-center gap-3">
                <span className="w-8 h-1 bg-[#e65100] rounded-full inline-block"></span>
                Latest Posts
              </h2>
              <Link
                href="/blog"
                className="text-[#e65100] hover:underline text-sm font-medium"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
