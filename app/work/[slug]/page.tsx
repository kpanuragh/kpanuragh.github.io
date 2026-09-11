import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { projects, getProject } from '@/lib/projects';
import { siteConfig } from '@/lib/seo-config';
import { getBreadcrumbSchema } from '@/lib/schema';

export function generateStaticParams() {
  return projects.map(p => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p) return {};
  return {
    title: p.name,
    description: p.blurb,
    alternates: { canonical: `/work/${p.slug}` },
    openGraph: { type: 'article', url: `${siteConfig.url}/work/${p.slug}`, title: `${p.name} — Anuragh KP`, description: p.blurb },
  };
}

export default async function ProjectPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p) notFound();

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim mb-3">
        {p.language}
      </div>
      <h1 className="text-[27px] leading-tight mb-3">{p.name}</h1>
      <p className="text-[13.5px] text-mut leading-relaxed mb-7">{p.blurb}</p>

      <div className="flex gap-4 mb-9 font-mono text-[11.5px]">
        <a href={p.repo} target="_blank" rel="noopener noreferrer" className="text-acc2">Source</a>
        {p.npm && <a href={p.npm} target="_blank" rel="noopener noreferrer" className="text-acc2">npm</a>}
      </div>

      {p.body.map((para, i) => (
        <p key={i} className="text-[13px] text-mut leading-[1.8] mb-4">{para}</p>
      ))}

      <div className="mt-10 pt-5 border-t border-line">
        <Link href="/work" className="text-[12px] text-mut no-underline">&larr; All work</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(getBreadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Work', url: '/work' },
            { name: p.name, url: `/work/${p.slug}` },
          ])),
        }}
      />
    </div>
  );
}
