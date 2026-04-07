import Link from 'next/link';

export default function Header() {
  return (
    <header className="w-full py-5 border-b border-terminal-border bg-white">
      <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-terminal-highlight hover:text-terminal-accent transition-colors">
          0x55aa
        </Link>
        <nav className="flex gap-6">
          <Link href="/blog" className="text-sm font-medium text-terminal-text hover:text-terminal-accent transition-colors">
            Blog
          </Link>
          <Link href="/#about" className="text-sm font-medium text-terminal-text hover:text-terminal-accent transition-colors">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
