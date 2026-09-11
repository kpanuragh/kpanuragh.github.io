import CopyLinkButton from './CopyLinkButton';

export default function ShareButtons({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: 'X', href: `https://x.com/intent/tweet?url=${u}&text=${t}` },
    { label: 'Hacker News', href: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}` },
  ];
  return (
    <div className="mt-12 pt-6 border-t border-line flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-mut">Share:</span>
      {links.map(l => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 text-xs font-medium rounded-full border border-line text-mut hover:border-acc hover:text-acc transition-colors"
        >
          {l.label}
        </a>
      ))}
      <CopyLinkButton url={url} />
    </div>
  );
}
