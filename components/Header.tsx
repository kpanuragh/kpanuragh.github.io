import Link from 'next/link';

export default function Header() {
  return (
    <header className="w-full py-4 mb-8">
      <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-terminal-accent hover:text-terminal-highlight transition-colors">
          0x55aa
        </Link>
        <nav className="flex gap-6">
          <Link href="/blog" className="text-terminal-text hover:text-terminal-success transition-colors">
            Blog
          </Link>
          <Link href="/#about" className="text-terminal-text hover:text-terminal-success transition-colors">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
