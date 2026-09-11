import Link from 'next/link';

const nav = [
  { href: '/work', label: 'Work' },
  { href: '/blog', label: 'Writing' },
  { href: '/about', label: 'Experience' },
  { href: '/contact', label: 'Contact' },
];

export default function Header() {
  return (
    <header className="w-full sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-line">
      <div className="max-w-4xl mx-auto px-5 h-14 flex justify-between items-center">
        <Link href="/" className="font-sans font-semibold text-[#eceff4] tracking-tight">
          Anuragh KP
          <span className="ml-2 text-[11px] font-normal text-dim">0x55aa</span>
        </Link>
        <nav aria-label="Main" className="flex gap-5 text-[12.5px] text-mut">
          {nav.map(n => (
            <Link key={n.href} href={n.href} className="hover:text-tx transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
