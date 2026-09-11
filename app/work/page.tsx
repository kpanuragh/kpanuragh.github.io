import type { Metadata } from 'next';
import Link from 'next/link';
import { projects } from '@/lib/projects';
import { siteConfig } from '@/lib/seo-config';

export const metadata: Metadata = {
  title: 'Work',
  description: 'Open-source projects by Anuragh KP — compression libraries, MCP servers, and an operating system kernel.',
  alternates: { canonical: '/work' },
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/work`,
    title: 'Work — Anuragh KP',
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: 'Work — Anuragh KP',
      },
    ],
  },
};

export default function WorkIndex() {
  return (
    <div className="max-w-4xl mx-auto px-5 py-12">
      <h1 className="text-[29px] mb-3">Work</h1>
      <p className="text-[13px] text-mut leading-relaxed mb-9 max-w-2xl">
        Open source, mostly. Libraries I needed and couldn&rsquo;t find, plus one kernel that exists
        because two courses made it look easier than it was.
      </p>

      <div className="flex flex-col gap-5">
        {projects.map(p => (
          <Link key={p.slug} href={`/work/${p.slug}`}
                className="no-underline border-t border-line pt-4 block group">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="m-0 text-[17px] group-hover:text-acc transition-colors">{p.name}</h2>
              <span className="font-mono text-[10px] text-dim shrink-0">{p.language}</span>
            </div>
            <p className="mt-2 mb-0 text-[12px] text-mut leading-relaxed">{p.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
