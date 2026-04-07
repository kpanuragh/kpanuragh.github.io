import Link from 'next/link';

export default function Header() {
  return (
    <header className="w-full bg-white sticky top-0 z-50 border-b border-terminal-border" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex justify-between items-center">
        <Link href="/" className="text-lg font-bold text-terminal-highlight hover:text-terminal-accent transition-colors tracking-tight">
          0x55aa
        </Link>
        <nav className="flex gap-1">
          <Link href="/blog" className="px-3 py-1.5 text-sm font-medium text-terminal-text hover:text-terminal-accent hover:bg-gray-50 rounded-lg transition-colors">
            Blog
          </Link>
          <Link href="/#about" className="px-3 py-1.5 text-sm font-medium text-terminal-text hover:text-terminal-accent hover:bg-gray-50 rounded-lg transition-colors">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
