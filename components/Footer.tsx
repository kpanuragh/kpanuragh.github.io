import { siteConfig } from '@/lib/seo-config';

const links = [
  { href: `https://github.com/${siteConfig.social.github}`, label: 'GitHub' },
  { href: `https://www.linkedin.com/in/${siteConfig.social.linkedin}`, label: 'LinkedIn' },
  { href: `https://www.npmjs.com/~${siteConfig.social.npm}`, label: 'npm' },
  { href: `https://x.com/${siteConfig.social.twitter.replace('@', '')}`, label: 'X' },
  { href: `mailto:${siteConfig.contactEmail}`, label: 'Email' },
];

export default function Footer() {
  return (
    <footer className="w-full mt-20 border-t border-line">
      <div className="max-w-4xl mx-auto px-5 py-7 flex flex-wrap gap-4 justify-between items-center text-[12px] text-dim">
        <span>Kochi, Kerala</span>
        <span className="flex gap-4">
          {links.map(l => {
            const isMailto = l.href.startsWith('mailto:');
            return (
              <a key={l.label} href={l.href} {...(!isMailto && { target: '_blank', rel: 'noopener noreferrer' })}
                 className="text-mut hover:text-tx transition-colors no-underline">
                {l.label}
              </a>
            );
          })}
        </span>
      </div>
    </footer>
  );
}
