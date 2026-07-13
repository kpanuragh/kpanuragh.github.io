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
    <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700/50 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Share:</span>
      {links.map(l => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#e65100] hover:text-[#e65100] transition-colors"
        >
          {l.label}
        </a>
      ))}
      <CopyLinkButton url={url} />
    </div>
  );
}
