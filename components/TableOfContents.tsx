'use client';

import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export default function TableOfContents() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const prose = document.querySelector('.prose');
    if (!prose) return;

    const elements = prose.querySelectorAll('h2, h3');
    const items: TocItem[] = [];

    elements.forEach((el) => {
      if (!el.id) {
        el.id = el.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || '';
      }
      items.push({
        id: el.id,
        text: el.textContent || '',
        level: el.tagName === 'H2' ? 2 : 3,
      });
    });

    setHeadings(items);
  }, []);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.1 }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="hidden xl:block fixed right-[max(1rem,calc((100vw-768px)/2-280px))] top-24 w-56 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="space-y-1 border-l border-gray-200 dark:border-gray-700">
        {headings.map(({ id, text, level }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`block text-xs leading-relaxed py-1 transition-colors duration-200 border-l-2 -ml-px ${
                level === 3 ? 'pl-5' : 'pl-3'
              } ${
                activeId === id
                  ? 'border-[#e65100] text-[#e65100] dark:text-[#ff8a50] font-medium'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
