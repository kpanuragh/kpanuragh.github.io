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
      {/* Hero Section with gradient background */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#fff7ed] via-[#f8f9fa] to-[#f0f4ff] dark:from-[#0f172a] dark:via-[#1e293b] dark:to-[#0f172a]">
        <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{ background: 'radial-gradient(circle at 20% 50%, #e6510020, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f620, transparent 50%)' }} />
        <div className="max-w-5xl mx-auto px-4 py-20 md:py-28 relative z-10">
          <div className="flex flex-col items-center text-center">
            <div className="shrink-0 mb-8">
              <div className="relative w-36 h-36 md:w-44 md:h-44">
                <div className="absolute -inset-1 rounded-full" style={{ background: 'linear-gradient(135deg, #e65100, #ff8a50, #e65100)' }} />
                <div className="absolute inset-0 rounded-full overflow-hidden border-3 border-white">
                  <Image
                    src="/profile.jpg"
                    alt="Anurag KP"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-terminal-highlight dark:text-gray-100 tracking-tight mb-4">
              Anurag KP
            </h1>
            <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 mb-8 max-w-lg">
              Laravel Developer &middot; Security Enthusiast &middot; Radio Explorer
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <Link
                href="/blog"
                className="px-6 py-2.5 text-white text-sm font-semibold rounded-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #e65100, #ff6d00)' }}
              >
                Read the Blog
              </Link>
              <Link
                href="#about"
                className="px-6 py-2.5 bg-white/80 backdrop-blur-sm text-terminal-highlight text-sm font-semibold rounded-full border border-gray-200 hover:border-[#e65100] hover:text-[#e65100] transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                About Me
              </Link>
            </div>
            {/* Social Icons Row */}
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { href: 'https://github.com/kpanuragh', label: 'GitHub', icon: (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>) },
                { href: 'https://www.linkedin.com/in/anuraghkp', label: 'LinkedIn', icon: (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>) },
                { href: 'https://stackoverflow.com/users/9456940/anuragh-kp', label: 'Stack Overflow', icon: (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M15.725 0l-1.72 1.277 6.39 8.588 1.72-1.277L15.725 0zm-3.94 3.418l-1.369 1.644 8.225 6.85 1.369-1.644-8.225-6.85zm-3.15 4.65l-.905 1.94 9.702 4.517.905-1.94-9.702-4.517zm-1.85 4.86l-.44 2.093 10.473 2.201.44-2.092-10.473-2.203zM1.89 15.47V24h19.19v-8.53h-2.133v6.397H4.021v-6.396H1.89zm4.265 2.133v2.13h10.66v-2.13H6.154z"/></svg>) },
                { href: 'https://www.npmjs.com/~kpanuragh', label: 'npm', icon: (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0H1.763zM5.13 5.323h13.74v13.354h-3.344V8.66H12.2v10.017H5.13V5.323z"/></svg>) },
                { href: 'https://x.com/anuragh_kp', label: 'X', icon: (<svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>) },
                { href: 'https://www.instagram.com/anuraghkp', label: 'Instagram', icon: (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/></svg>) },
              ].map(({ href, label, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-[#e65100] dark:hover:text-[#ff8a50] hover:border-[#e65100] dark:hover:border-[#ff8a50] hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4">
        {/* About Section */}
        <section id="about" className="scroll-mt-20 py-16">
          <h2 className="text-2xl font-bold text-terminal-highlight mb-8 flex items-center gap-3">
            <span className="w-8 h-1 bg-[#e65100] rounded-full inline-block"></span>
            About
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: (<span className="text-[#e65100] font-bold text-sm">&lt;/&gt;</span>), title: 'Development', desc: 'Passionate Laravel Developer who thrives on coding and debugging, constantly turning challenges into opportunities for growth. An advocate for open-source, contributing to various projects and believing in the power of collaboration.' },
              { icon: '🛡️', title: 'Security', desc: 'Deep interest in cybersecurity, actively contributing as a core member of communities like YAS (Yet Another Security) and InitCrew, collaborating to push the boundaries of digital security.' },
              { icon: '📡', title: 'Radio & SDR', desc: 'Exploring the fascinating world of Radio Frequency using SDR devices, blending curiosity for technology with hands-on experimentation in signal analysis and spectrum exploration.' },
              { icon: '❤️', title: 'Open Source', desc: 'Love giving back to the community by contributing to open-source projects. Technology inspires me in every way — a boundless world of possibilities that fuels creativity every single day.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="group bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-7 transition-all duration-300 hover:shadow-xl hover:shadow-orange-100/50 dark:hover:shadow-orange-900/20 hover:-translate-y-1 hover:border-[#e65100]/20">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#fff3e0] to-[#ffe0b2] flex items-center justify-center mb-5 text-lg group-hover:scale-110 transition-transform duration-300">
                  {icon}
                </div>
                <h3 className="font-semibold text-terminal-highlight dark:text-gray-100 mb-2 text-lg">{title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Latest Posts Section */}
        {recentPosts.length > 0 && (
          <section className="pb-16">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-terminal-highlight flex items-center gap-3">
                <span className="w-8 h-1 bg-[#e65100] rounded-full inline-block"></span>
                Latest Posts
              </h2>
              <Link
                href="/blog"
                className="px-4 py-2 text-[#e65100] hover:bg-[#fff3e0] rounded-full text-sm font-medium transition-colors"
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
