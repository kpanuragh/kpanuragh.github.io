import type { Metadata } from 'next';
import { siteConfig } from '@/lib/seo-config';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach Anuragh KP — email, GitHub, LinkedIn.',
  alternates: { canonical: '/contact' },
};

const ways = [
  { label: 'Email', value: siteConfig.contactEmail, href: `mailto:${siteConfig.contactEmail}` },
  { label: 'GitHub', value: `github.com/${siteConfig.social.github}`, href: `https://github.com/${siteConfig.social.github}` },
  { label: 'LinkedIn', value: `linkedin.com/in/${siteConfig.social.linkedin}`, href: `https://www.linkedin.com/in/${siteConfig.social.linkedin}` },
];

export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <h1 className="text-[29px] mb-4">Contact</h1>
      <p className="text-[13px] text-mut leading-[1.8] mb-8">
        Email is the reliable one, taking on the occasional consulting engagement — backend
        architecture, security review, and the DevOps underneath — when it fits around the day job.
      </p>

      <div className="panel">
        {ways.map((w, i) => (
          <div key={w.label}
               className={`flex justify-between gap-3 px-4 py-3 text-[12px] ${i < ways.length - 1 ? 'border-b border-line' : ''}`}>
            <span className="text-dim font-mono text-[11px]">{w.label}</span>
            <a href={w.href} target="_blank" rel="noopener noreferrer" className="text-acc2 no-underline">
              {w.value}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
