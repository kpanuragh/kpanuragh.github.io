import Link from 'next/link';
import FactsPanel from '@/components/FactsPanel';
import Thread from '@/components/Thread';
import SecurityLead from '@/components/SecurityLead';
import RoleList from '@/components/RoleList';
import CertGrid from '@/components/CertGrid';
import { featuredProjects } from '@/lib/projects';
import { getProfilePageSchema, getWebSiteSchema } from '@/lib/schema';

export default function Home() {
  const featured = featuredProjects().slice(0, 2);

  return (
    <div className="max-w-4xl mx-auto px-5 py-12">
      <section className="grid md:grid-cols-[1.55fr_1fr] gap-8 items-start">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-acc font-semibold mb-3.5">
            Anuragh KP
          </div>
          <h1 className="text-[29px] leading-tight mb-4">
            Backend systems, and the security problems they tend to create.
          </h1>
          <p className="text-[13.5px] text-mut leading-relaxed mb-3">
            I&rsquo;m a <b className="text-tx font-medium">Technical Lead at Cubet Techno Labs</b>,
            where I&rsquo;ve worked since 2021 — serverless commerce backends on AWS, and dragging a
            Learning Management System from Slim 3 to Slim 4 and PHP 8.2 without breaking it.
          </p>
          <p className="text-[12px] text-dim leading-relaxed m-0">
            Outside that I publish compression libraries, contribute where I can, and volunteer with
            the Kerala Police Cyberdome, taking the occasional consulting engagement when it fits
            around that.
          </p>
        </div>
        <FactsPanel />
      </section>

      <section className="mt-9">
        <div className="rule mb-4">Two courses and a bad idea</div>
        <Thread />
      </section>

      <section className="mt-9">
        <div className="rule mb-4">Security</div>
        <SecurityLead />
      </section>

      <section className="mt-9">
        <div className="rule mb-4">Some of the work</div>
        <div className="grid sm:grid-cols-2 gap-4">
          {featured.map(p => (
            <Link key={p.slug} href={`/work/${p.slug}`} className="no-underline border-t border-line pt-3 block group">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                {p.language}
              </div>
              <h4 className="my-2 text-[14.5px] leading-snug group-hover:text-acc transition-colors">
                {p.name}
              </h4>
              <p className="m-0 text-[11.5px] text-mut leading-relaxed">{p.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <div className="rule mb-4">Where I&rsquo;ve been</div>
        <RoleList />
      </section>

      <section className="mt-9">
        <div className="rule mb-4">Certifications</div>
        <CertGrid />
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([getProfilePageSchema(), getWebSiteSchema()]),
        }}
      />
    </div>
  );
}
