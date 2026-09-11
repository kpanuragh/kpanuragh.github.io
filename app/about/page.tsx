import type { Metadata } from 'next';
import RoleList from '@/components/RoleList';
import CertGrid from '@/components/CertGrid';
import { getPersonSchema } from '@/lib/schema';
import { siteConfig } from '@/lib/seo-config';
import { roles, yearsWorking } from '@/lib/cv';

export const metadata: Metadata = {
  title: 'Experience',
  description: 'Anuragh KP — Technical Lead at Cubet Techno Labs, Kochi. Backend architecture, application security and DevOps since 2017.',
  alternates: { canonical: '/about' },
  openGraph: { type: 'profile', url: `${siteConfig.url}/about`, title: 'Experience — Anuragh KP' },
};

export default function About() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <h1 className="text-[29px] mb-4">Experience</h1>

      <p className="text-[13px] text-mut leading-[1.8] mb-4">
        I&rsquo;m Anuragh KP — also written Anuragh K P — a Technical Lead at Cubet Techno Labs in
        Kochi. I&rsquo;ve been building backend systems since 2017, which makes it {yearsWorking()} years
        now, mostly in PHP and Node, increasingly in Rust.
      </p>
      <p className="text-[13px] text-mut leading-[1.8] mb-9">
        The work splits roughly three ways: architecture and delivery at Cubet, application security
        both there and as a volunteer with the Kerala Police Cyberdome, and open source in whatever
        time is left. The security side is the thread that runs through all of it.
      </p>

      <div className="rule mb-4">Roles</div>
      <RoleList />

      <div className="mt-6 flex flex-col gap-4">
        {roles.filter(r => r.note).map(r => (
          <div key={r.org} className="border-l-2 border-line pl-4">
            <div className="text-[12px] text-tx font-medium mb-1">{r.org}</div>
            <p className="m-0 text-[11.5px] text-mut leading-relaxed">{r.note}</p>
          </div>
        ))}
      </div>

      <div className="rule mb-4 mt-10">Certifications</div>
      <CertGrid />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getPersonSchema()) }}
      />
    </div>
  );
}
