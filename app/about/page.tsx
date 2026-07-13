import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { siteConfig } from '@/lib/seo-config';
import { getPersonSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'About — Anuragh KP',
  description:
    'Anuragh KP — Technical Lead at Cubet Techno Labs. Backend engineering, application security, and DevOps. Available for consulting and collaboration.',
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'profile',
    url: `${siteConfig.url}/about`,
    title: 'About — Anuragh KP',
    description:
      'Technical Lead at Cubet Techno Labs. Backend, security, and DevOps. Open to consulting and collaboration.',
  },
};

const skills = [
  'Laravel / PHP', 'Node.js', 'Backend Architecture', 'REST & GraphQL APIs',
  'Application Security', 'Kubernetes', 'CI/CD & DevOps', 'PostgreSQL / MySQL',
];

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="flex items-center gap-5 mb-8">
        <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#e65100] shrink-0">
          <Image src="/profile.jpg" alt="Anuragh KP" fill className="object-cover" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-terminal-highlight dark:text-gray-100">Anuragh KP</h1>
          <p className="text-gray-500 dark:text-gray-400">Technical Lead @ Cubet Techno Labs</p>
        </div>
      </div>

      <div className="prose max-w-none dark:prose-invert">
        <p>
          I&rsquo;m a Technical Lead at Cubet Techno Labs, where I build and ship
          backend systems and lead engineering teams. My work spans API design,
          application security, and the DevOps that keeps it all running in production.
        </p>
        <p>
          I write here about the practical, hard-won lessons behind that work —
          Laravel and Node.js internals, securing real systems, and running
          containers without the 3am pages. Earlier in my career, at Acodez, I cut
          my teeth on full-stack web development before focusing on backend and security.
        </p>
      </div>

      <h2 className="text-xl font-bold text-terminal-highlight dark:text-gray-100 mt-10 mb-4">What I work with</h2>
      <div className="flex flex-wrap gap-2">
        {skills.map(s => (
          <span key={s} className="tag-pill">{s}</span>
        ))}
      </div>

      <h2 className="text-xl font-bold text-terminal-highlight dark:text-gray-100 mt-10 mb-4">Work with me</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-5">
        Open to consulting, technical advisory, and collaboration on backend and
        security work. The fastest way to reach me:
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={`mailto:${siteConfig.contactEmail}`} className="px-6 py-2.5 text-white text-sm font-semibold rounded-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg, #e65100, #ff6d00)' }}>
          Email me
        </a>
        <a href={`https://www.linkedin.com/in/${siteConfig.social.linkedin}`} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 bg-white/80 dark:bg-gray-800/80 text-terminal-highlight dark:text-gray-200 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#e65100] hover:text-[#e65100] transition-all duration-200">
          LinkedIn
        </a>
        <a href={`https://github.com/${siteConfig.social.github}`} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 bg-white/80 dark:bg-gray-800/80 text-terminal-highlight dark:text-gray-200 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#e65100] hover:text-[#e65100] transition-all duration-200">
          GitHub
        </a>
      </div>

      <div className="mt-12">
        <Link href="/blog" className="text-[#e65100] font-medium hover:underline">&larr; Read the blog</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getPersonSchema()) }}
      />
    </div>
  );
}
