import Link from 'next/link';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  return (
    <header className="w-full bg-white dark:bg-gray-900 sticky top-0 z-50 border-b border-terminal-border dark:border-gray-800 transition-colors duration-200" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex justify-between items-center">
        <Link href="/" className="text-lg font-bold text-terminal-highlight dark:text-gray-100 hover:text-terminal-accent transition-colors tracking-tight">
          0x55aa
        </Link>
        <div className="flex items-center gap-1">
          <nav className="flex gap-1">
            <Link href="/blog" className="px-3 py-1.5 text-sm font-medium text-terminal-text dark:text-gray-300 hover:text-terminal-accent hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
              Blog
            </Link>
            <Link href="/about" className="px-3 py-1.5 text-sm font-medium text-terminal-text dark:text-gray-300 hover:text-terminal-accent hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
              About
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
